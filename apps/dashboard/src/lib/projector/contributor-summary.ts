// Projector: contributor_summary — materializa agregaciones de contribuidores.
// Owner: historian.py (V2.d). Cuando V2.h llegue, el Projector formal hereda.

import { getDb } from "@/lib/db";
import { percentiles } from "@/lib/queries";

/**
 * Refresca la tabla contributor_summary leyendo de las tablas base.
 * Idempotente: DELETE + INSERT dentro de transacción.
 */
export function refreshContributorSummary(): number {
  const db = getDb();
  if (!db) return 0;

  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

  // Obtener el último poll
  const latestPoll = db
    .prepare("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1")
    .get() as { ts: string } | undefined;
  if (!latestPoll) return 0;

  // Agregar PRs por autor (abiertos/mergeados/cerrados) del último poll
  const prCounts = db
    .prepare(
      `SELECT pa.login,
              SUM(CASE WHEN ps.state = 'OPEN' THEN 1 ELSE 0 END) AS prs_opened,
              SUM(CASE WHEN ps.state = 'MERGED' THEN 1 ELSE 0 END) AS prs_merged,
              SUM(CASE WHEN ps.state = 'CLOSED' THEN 1 ELSE 0 END) AS prs_closed,
              MAX(ps.updated_at) AS last_active
       FROM pr_author pa
       JOIN pr_snapshot ps ON ps.ts = pa.ts AND ps.number = pa.pr_number
       WHERE pa.ts = ?
       GROUP BY pa.login`,
    )
    .all(latestPoll.ts) as Array<{
    login: string;
    prs_opened: number;
    prs_merged: number;
    prs_closed: number;
    last_active: string;
  }>;

  // Cycle-time por autor (PRs mergeados con created_at/merged_at)
  const cycleRows = db
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

  // Calcular percentiles por autor
  const cycleByLogin = new Map<string, number[]>();
  for (const r of cycleRows) {
    const created = Date.parse(r.created);
    const merged = Date.parse(r.merged);
    if (Number.isNaN(created) || Number.isNaN(merged)) continue;
    const hours = Math.max(0, (merged - created) / 3600000);
    if (hours > 0) {
      const arr = cycleByLogin.get(r.login);
      if (arr) arr.push(hours);
      else cycleByLogin.set(r.login, [hours]);
    }
  }

  // Commit share: % del total de PRs
  const totalPrs = prCounts.reduce(
    (s, r) => s + r.prs_opened + r.prs_merged + r.prs_closed,
    0,
  );

  // Persistir
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM contributor_summary").run();
    const insert = db.prepare(
      `INSERT INTO contributor_summary
       (login, prs_opened, prs_merged, prs_closed, cycle_p50_h, cycle_p90_h,
        commit_share_pct, last_active, refreshed_at, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );

    for (const r of prCounts) {
      const ct = cycleByLogin.get(r.login);
      const p = ct ? percentiles(ct) : { p50: null, p90: null };
      const total = r.prs_opened + r.prs_merged + r.prs_closed;
      const share = totalPrs > 0 ? Math.round((total / totalPrs) * 10000) / 100 : 0;

      insert.run(
        r.login,
        r.prs_opened,
        r.prs_merged,
        r.prs_closed,
        p.p50,
        p.p90,
        share,
        r.last_active,
        now,
      );
    }
  });

  txn();
  return prCounts.length;
}
