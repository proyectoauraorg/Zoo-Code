import { getDb } from "@/lib/db";
import { columnEntryTs } from "@/lib/kanban";
import type { MetricPoint, PrEvent } from "@/lib/types";

// Lecturas de la DB: historia / tendencias / aging. (Estado actual = snapshot vivo.)
// Todo degrada a vacío si la DB aún no existe.

interface MetricRow {
  d: string;
  pr_open: number;
  pr_ci_failing: number;
  issues: number;
}

/** Serie diaria (MAX por día) para sparklines/charts del Overview. */
export function getMetricSeries(days = 30): MetricPoint[] {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT date(ts) AS d,
              MAX(pr_open) AS pr_open,
              MAX(pr_ci_failing) AS pr_ci_failing,
              MAX(issues) AS issues
       FROM repo_metric
       GROUP BY d
       ORDER BY d DESC
       LIMIT ?`,
    )
    .all(days) as MetricRow[];
  return rows
    .map((r) => ({
      date: r.d,
      prOpen: r.pr_open ?? 0,
      prCiFailing: r.pr_ci_failing ?? 0,
      issues: r.issues ?? 0,
    }))
    .reverse();
}

/** PRs mergeados en los últimos 7 días, según los eventos derivados. */
export function getMergedThisWeek(): number {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .slice(0, 19) + "Z";
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT number) AS n
       FROM pr_event
       WHERE kind = 'merged' AND ts >= ?`,
    )
    .get(cutoff) as { n: number } | undefined;
  return row?.n ?? 0;
}

interface EventRow {
  ts: string;
  number: number;
  kind: string;
  from_state: string | null;
  to_state: string | null;
  detail: string | null;
}

/** Últimos eventos derivados (feed de actividad del Overview). */
export function getRecentEvents(limit = 20): PrEvent[] {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT ts, number, kind, from_state, to_state, detail
       FROM pr_event
       ORDER BY ts DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as EventRow[];
  return rows.map((r) => ({
    ts: r.ts,
    number: r.number,
    kind: r.kind,
    fromState: r.from_state,
    toState: r.to_state,
    detail: r.detail,
  }));
}

interface PrHistoryRow {
  number: number;
  ts: string;
  state: string;
  review_decision: string;
  is_draft: number;
}

/**
 * Para cada PR, el ts de entrada a su columna actual: el más antiguo de la racha
 * contigua (terminando en el último snapshot) con la misma columna Kanban.
 * Aproxima el "aging" (SPEC §4). Devuelve number → ISO ts de entrada.
 */
export function getColumnEntryTimes(): Map<number, string> {
  const db = getDb();
  const out = new Map<number, string>();
  if (!db) return out;

  const rows = db
    .prepare(
      `SELECT number, ts, state, review_decision, is_draft
       FROM pr_snapshot
       ORDER BY number ASC, ts ASC`,
    )
    .all() as PrHistoryRow[];

  const byNumber = new Map<number, PrHistoryRow[]>();
  for (const r of rows) {
    const arr = byNumber.get(r.number);
    if (arr) arr.push(r);
    else byNumber.set(r.number, [r]);
  }

  for (const [number, history] of byNumber) {
    const entryTs = columnEntryTs(
      history.map((h) => ({
        ts: h.ts,
        state: h.state,
        reviewDecision: h.review_decision,
        isDraft: Boolean(h.is_draft),
      })),
    );
    if (entryTs) out.set(number, entryTs);
  }
  return out;
}

/** Días transcurridos desde un ISO ts hasta ahora (≥ 0). */
export function daysSince(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

// --- Contributor Analytics ---

interface ContributorRow {
  login: string;
  first_seen: string;
  last_seen: string;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
}

/** Devuelve todos los contributors registrados en la DB. */
export function getContributors(): ContributorRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT login, first_seen, last_seen,
              prs_opened, prs_merged, prs_closed
       FROM contributor
       ORDER BY prs_opened + prs_merged DESC`,
    )
    .all() as ContributorRow[];
}

/** PRs abiertos actuales agrupados por autor. */
export function getOpenPrsByAuthor(): Map<string, { count: number; ciFailing: number; conflicts: number }> {
  const db = getDb();
  const out = new Map<string, { count: number; ciFailing: number; conflicts: number }>();
  if (!db) return out;

  // Obtener el último poll
  const latestPoll = db
    .prepare("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1")
    .get() as { ts: string } | undefined;
  if (!latestPoll) return out;

  // PRs abiertos del último poll con su autor
  const rows = db
    .prepare(
      `SELECT pa.login, ps.ci_state, ps.mergeable
       FROM pr_author pa
       JOIN pr_snapshot ps ON ps.ts = pa.ts AND ps.number = pa.pr_number
       WHERE pa.ts = ? AND ps.state = 'OPEN'`,
    )
    .all(latestPoll.ts) as Array<{
    login: string;
    ci_state: string;
    mergeable: string;
  }>;

  for (const r of rows) {
    const entry = out.get(r.login) ?? { count: 0, ciFailing: 0, conflicts: 0 };
    entry.count++;
    if (r.ci_state === "fail") entry.ciFailing++;
    if (r.mergeable === "CONFLICTING") entry.conflicts++;
    out.set(r.login, entry);
  }

  return out;
}

// --- Cycle-time y Bus Factor (V2.b.1) ---

interface CycleTimeRow {
  login: string;
  cycle_hours: number;
}

/**
 * Cycle-time (horas) de PRs mergeados con created_at y merged_at conocidos.
 * Devuelve filas con (login, cycle_hours) para calcular percentiles.
 */
export function getCycleTimes(): CycleTimeRow[] {
  const db = getDb();
  if (!db) return [];

  // Buscar el primer y último poll donde cada PR apareció como MERGED
  // con created_at y merged_at disponibles
  const rows = db
    .prepare(
      `SELECT pa.login,
              MIN(ps.created_at) AS created,
              MAX(ps.merged_at) AS merged
       FROM pr_author pa
       JOIN pr_snapshot ps ON ps.ts = pa.ts AND ps.number = pa.pr_number
       WHERE ps.state = 'MERGED'
         AND ps.created_at IS NOT NULL AND ps.created_at != ''
         AND ps.merged_at IS NOT NULL AND ps.merged_at != ''
       GROUP BY pa.login, pa.pr_number`,
    )
    .all() as Array<{ login: string; created: string; merged: string }>;

  const result: CycleTimeRow[] = [];
  for (const r of rows) {
    const created = Date.parse(r.created);
    const merged = Date.parse(r.merged);
    if (Number.isNaN(created) || Number.isNaN(merged)) continue;
    const hours = Math.max(0, (merged - created) / 3600000);
    if (hours > 0) {
      result.push({ login: r.login, cycle_hours: hours });
    }
  }
  return result;
}

/**
 * Calcula percentiles p50 y p90 de un array de valores numéricos.
 * Función pura, testeable.
 */
export function percentiles(values: number[]): { p50: number; p90: number } {
  if (values.length === 0) return { p50: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p90Idx = Math.floor(sorted.length * 0.9);
  return {
    p50: Math.round(sorted[p50Idx] * 10) / 10,
    p90: Math.round(sorted[p90Idx] * 10) / 10,
  };
}

/**
 * Bus Factor: cuántos autores necesarios para cubrir el 50% de los PRs.
 * Menor = más concentración = más riesgo.
 */
export function getBusFactor(): {
  factor: number;
  topAuthor: string;
  topSharePct: number;
  distribution: Array<{ login: string; total: number; sharePct: number }>;
} {
  const db = getDb();
  if (!db)
    return { factor: 0, topAuthor: "", topSharePct: 0, distribution: [] };

  const rows = db
    .prepare(
      `SELECT login,
              prs_opened + prs_merged + prs_closed AS total
       FROM contributor
       WHERE login NOT LIKE '[bot]%'
       ORDER BY total DESC`,
    )
    .all() as Array<{ login: string; total: number }>;

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  if (grandTotal === 0)
    return { factor: 0, topAuthor: "", topSharePct: 0, distribution: [] };

  let cumulative = 0;
  let factor = 0;
  const distribution: Array<{
    login: string;
    total: number;
    sharePct: number;
  }> = [];

  for (const r of rows) {
    cumulative += r.total;
    factor++;
    const sharePct = Math.round((r.total / grandTotal) * 100);
    distribution.push({ login: r.login, total: r.total, sharePct });
    if (cumulative >= grandTotal * 0.5) break;
  }

  return {
    factor,
    topAuthor: rows[0]?.login ?? "",
    topSharePct: Math.round(((rows[0]?.total ?? 0) / grandTotal) * 100),
    distribution,
  };
}

// --- Discord Analytics ---

interface DiscordChannelRow {
  channel: string;
  count: number;
}

interface DiscordUserRow {
  user: string;
  count: number;
}

interface DiscordSeriesRow {
  d: string;
  count: number;
}

/** Top canales por número de mensajes. */
export function getDiscordByChannel(limit = 10): DiscordChannelRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT channel, COUNT(*) AS count
       FROM discord_activity
       WHERE channel IS NOT NULL AND channel != ''
       GROUP BY channel
       ORDER BY count DESC
       LIMIT ?`,
    )
    .all(limit) as DiscordChannelRow[];
}

/** Top usuarios por número de mensajes. */
export function getDiscordByUser(limit = 10): DiscordUserRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT user, COUNT(*) AS count
       FROM discord_activity
       WHERE user IS NOT NULL AND user != ''
       GROUP BY user
       ORDER BY count DESC
       LIMIT ?`,
    )
    .all(limit) as DiscordUserRow[];
}

/** Serie temporal de actividad Discord (mensajes por día). */
export function getDiscordSeries(days = 30): DiscordSeriesRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT date(ts) AS d, COUNT(*) AS count
       FROM discord_activity
       GROUP BY d
       ORDER BY d DESC
       LIMIT ?`,
    )
    .all(days)
    .reverse() as DiscordSeriesRow[];
}

/** Último registro de actividad Discord. */
export function getDiscordLastActivity(): string | null {
  const db = getDb();
  if (!db) return null;
  const row = db
    .prepare("SELECT MAX(ts) AS last_ts FROM discord_activity")
    .get() as { last_ts: string | null } | undefined;
  return row?.last_ts ?? null;
}

/** Total de mensajes Discord. */
export function getDiscordTotal(): number {
  const db = getDb();
  if (!db) return 0;
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM discord_activity")
    .get() as { n: number } | undefined;
  return row?.n ?? 0;
}
