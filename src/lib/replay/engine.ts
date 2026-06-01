// Replay Engine (V2.h) — reconstrucción determinista de estado derivado.
// Contract: V2H_SPEC.md §2, REPLAY_DETERMINISM_CONTRACT.md (R1–R6).
//
// Pipeline: event_log → conflict_lifecycle → conflict_trajectory → alerting → decision_log
// R4: ORDER BY ts ASC, id ASC
// R5: Idempotencia por INSERT OR IGNORE
// R6: Sin side effects fuera de la DB (no notificaciones en replay)
// R1: Sin clock global — usa event.ts y parámetro now

import type Database from "better-sqlite3";
import { getDbWritable, ensureDecisionLogTable } from "@/lib/db";
import { checkParity, type ParityResult } from "./parity-checker";
import { seedAlertRules } from "@/lib/alerting/engine";

// ── Types ──

export interface ReplayOptions {
  from?: string;           // ISO-8601
  to?: string;             // ISO-8601
  only?: "all" | "conflicts" | "contributors" | "metrics";
  intoTarget?: "live" | "shadow";  // shadow = tablas temporales _replay
  dryRun?: boolean;        // true = solo calcular, no persistir
}

export interface ReplayResult {
  eventsProcessed: number;
  decisionsRecorded: number;
  alertsGenerated: number;
  durationMs: number;
  parityCheck?: ParityResult;
}

// ── Main entry ──

/**
 * Ejecuta replay completo desde event_log.
 * Pipeline: lifecycle → trajectory → alerting (topological DAG order).
 */
export function executeReplay(options?: ReplayOptions): ReplayResult {
  const db = getDbWritable();
  if (!db) {
    return {
      eventsProcessed: 0,
      decisionsRecorded: 0,
      alertsGenerated: 0,
      durationMs: 0,
    };
  }

  const startTime = Date.now();
  const isShadow = options?.intoTarget === "shadow";
  const now = new Date().toISOString();

  // 1. Preparar tablas target
  if (isShadow) {
    createShadowTables(db);
  } else if (!options?.dryRun) {
    clearProjections(db);
  }

  // 2. Leer eventos ordenados (R4: ts ASC, id ASC)
  const events = readEventsInRange(db, options?.from, options?.to);

  // 3. Replay en orden topológico del DAG
  let decisions = 0;
  let alerts = 0;

  if (options?.dryRun) {
    // dryRun: solo contar eventos sin persistir
    return {
      eventsProcessed: events.length,
      decisionsRecorded: 0,
      alertsGenerated: 0,
      durationMs: Date.now() - startTime,
    };
  }

  for (const ev of events) {
    // Stage 1: conflict_lifecycle (depende de: event_log)
    replayProjectConflictEvent(db, ev, isShadow);

    // Stage 2: conflict_trajectory (depende de: conflict_lifecycle)
    replayProjectConflictTrajectory(db, ev, isShadow);
  }

  // Stage 3: alerting → decision_log (depende de: conflict_lifecycle + trajectory)
  if (isShadow) {
    decisions = replayEvaluateAlertRules(db, now, "_replay");
    alerts = countTableRows(db, "alert_replay");
  } else {
    decisions = replayEvaluateAlertRules(db, now);
    alerts = countTableRows(db, "alert");
  }

  // 4. Parity check (solo en shadow mode)
  let parity: ParityResult | undefined;
  if (isShadow) {
    parity = checkParity(db);
  }

  return {
    eventsProcessed: events.length,
    decisionsRecorded: decisions,
    alertsGenerated: alerts,
    durationMs: Date.now() - startTime,
    parityCheck: parity,
  };
}

// ── Global ordering (Determinism Contract §5.4) ──

/** Comparador global determinista: ts → aggregate_version → event_id. */
export function globalOrder(
  a: { ts: string; aggregate_version: number; event_id: string },
  b: { ts: string; aggregate_version: number; event_id: string },
): number {
  const ts = a.ts.localeCompare(b.ts);
  if (ts !== 0) return ts;
  const agg = a.aggregate_version - b.aggregate_version;
  if (agg !== 0) return agg;
  return a.event_id.localeCompare(b.event_id);
}

// ── Shadow tables ──

/** Crea tablas _replay como snapshot aislado (Determinism Contract §4.4). */
function createShadowTables(db: Database.Database): void {
  // Eliminar tablas shadow existentes (idempotente)
  db.exec(`
    DROP TABLE IF EXISTS conflict_lifecycle_replay;
    DROP TABLE IF EXISTS conflict_trajectory_replay;
    DROP TABLE IF EXISTS alert_replay;
    DROP TABLE IF EXISTS decision_log_replay;
  `);

  // Crear tablas shadow con la misma estructura
  db.exec(`
    CREATE TABLE conflict_lifecycle_replay AS SELECT * FROM conflict_lifecycle WHERE 0;
    CREATE TABLE conflict_trajectory_replay AS SELECT * FROM conflict_trajectory WHERE 0;
    CREATE TABLE alert_replay AS SELECT * FROM alert WHERE 0;
    CREATE TABLE decision_log_replay AS SELECT * FROM decision_log WHERE 0;
  `);
}

/** Limpia proyecciones live (modo live). */
function clearProjections(db: Database.Database): void {
  db.exec(`
    DELETE FROM conflict_lifecycle;
    DELETE FROM conflict_trajectory;
  `);
}

// ── Event reading (R4) ──

interface ReplayEvent {
  id: number;
  event_id: string;
  type: string;
  entity_kind: string;
  entity_ref: string;
  ts: string;
  aggregate_version: number;
  payload: string;
}

function readEventsInRange(
  db: Database.Database,
  from?: string,
  to?: string,
): ReplayEvent[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (from) {
    conditions.push("ts >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("ts <= ?");
    params.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT * FROM event_log ${where}
       ORDER BY ts ASC, id ASC`,
    )
    .all(...params) as ReplayEvent[];
}

// ── Replay projectors (aceptan db param, escriben a _replay si shadow) ──

function replayProjectConflictEvent(
  db: Database.Database,
  event: ReplayEvent,
  shadow: boolean,
): void {
  if (event.type !== "pr.conflict" && event.type !== "pr.conflict_resolved") return;

  const table = shadow ? "conflict_lifecycle_replay" : "conflict_lifecycle";
  const prNumber = Number(event.entity_ref);
  if (Number.isNaN(prNumber)) return;

  const payload = JSON.parse(event.payload) as Record<string, unknown>;

  if (event.type === "pr.conflict") {
    db.prepare(
      `INSERT OR IGNORE INTO ${table}
       (id, pr_number, state, event_id, aggregate_version, detected_at, title)
       VALUES (?, ?, 'entered', ?, ?, ?, ?)`,
    ).run(
      event.event_id,
      prNumber,
      event.event_id,
      event.aggregate_version,
      event.ts,
      (payload.title as string) ?? "",
    );
  } else if (event.type === "pr.conflict_resolved") {
    const last = db
      .prepare(
        `SELECT id, detected_at FROM ${table}
         WHERE pr_number = ? AND state = 'entered'
         ORDER BY aggregate_version DESC LIMIT 1`,
      )
      .get(prNumber) as { id: string; detected_at: string } | undefined;

    if (!last) return;

    // R1: usar event.ts, no Date.now()
    const detectedMs = Date.parse(last.detected_at);
    const resolvedMs = Date.parse(event.ts);
    const durationS =
      !Number.isNaN(detectedMs) && !Number.isNaN(resolvedMs)
        ? Math.max(0, Math.round((resolvedMs - detectedMs) / 1000))
        : null;

    db.prepare(
      `UPDATE ${table}
       SET state = 'resolved', resolved_at = ?, duration_seconds = ?
       WHERE id = ?`,
    ).run(event.ts, durationS, last.id);
  }
}

function replayProjectConflictTrajectory(
  db: Database.Database,
  event: ReplayEvent,
  shadow: boolean,
): void {
  if (event.type !== "pr.conflict" && event.type !== "pr.conflict_resolved") return;

  const table = shadow ? "conflict_trajectory_replay" : "conflict_trajectory";
  const lifecycleTable = shadow ? "conflict_lifecycle_replay" : "conflict_lifecycle";
  const prNumber = Number(event.entity_ref);
  if (Number.isNaN(prNumber)) return;

  const existing = db
    .prepare(`SELECT * FROM ${table} WHERE pr_number = ?`)
    .get(prNumber) as {
    pr_number: number;
    conflict_count: number;
    resolution_count: number;
    active_streak: number;
    cooldown_breaches: number;
    pressure_score: number;
    first_seen_at: string;
    last_seen_at: string;
    aggregate_version: number;
  } | undefined;

  if (event.type === "pr.conflict") {
    // Detectar cooldown breach (usa event.ts — R1 compliant)
    let cooldownBreaches = existing?.cooldown_breaches ?? 0;
    if (existing) {
      const lastConflict = db
        .prepare(
          `SELECT ts FROM event_log
           WHERE entity_kind = 'pr' AND entity_ref = ? AND type = 'pr.conflict'
           ORDER BY aggregate_version DESC LIMIT 1`,
        )
        .get(String(prNumber)) as { ts: string } | undefined;

      const lastResolved = db
        .prepare(
          `SELECT ts FROM event_log
           WHERE entity_kind = 'pr' AND entity_ref = ? AND type = 'pr.conflict_resolved'
           ORDER BY aggregate_version DESC LIMIT 1`,
        )
        .get(String(prNumber)) as { ts: string } | undefined;

      if (lastResolved && lastConflict) {
        const gapS =
          (Date.parse(lastConflict.ts) - Date.parse(lastResolved.ts)) / 1000;
        if (gapS >= 0 && gapS < 24 * 3600) {
          cooldownBreaches += 1;
        }
      }
    }

    const newConflictCount = (existing?.conflict_count ?? 0) + 1;
    const newActiveStreak = (existing?.active_streak ?? 0) + 1;

    const avgDuration = db
      .prepare(
        `SELECT AVG(duration_seconds) AS avg_s
         FROM ${lifecycleTable}
         WHERE pr_number = ? AND state = 'resolved' AND duration_seconds IS NOT NULL`,
      )
      .get(prNumber) as { avg_s: number | null } | undefined;

    const pressure = computePressureScore(
      newConflictCount,
      newActiveStreak,
      cooldownBreaches,
      avgDuration?.avg_s ?? null,
    );

    if (existing) {
      db.prepare(
        `UPDATE ${table}
         SET conflict_count = ?, active_streak = ?, cooldown_breaches = ?,
             pressure_score = ?, last_seen_at = ?, aggregate_version = ?
         WHERE pr_number = ?`,
      ).run(
        newConflictCount,
        newActiveStreak,
        cooldownBreaches,
        pressure,
        event.ts,
        event.aggregate_version,
        prNumber,
      );
    } else {
      db.prepare(
        `INSERT INTO ${table}
         (pr_number, conflict_count, resolution_count, active_streak,
          cooldown_breaches, pressure_score, first_seen_at, last_seen_at,
          aggregate_version)
         VALUES (?, 0 + 1, 0, ?, ?, ?, ?, ?, ?)`,
      ).run(
        prNumber,
        newActiveStreak,
        cooldownBreaches,
        pressure,
        event.ts,
        event.ts,
        event.aggregate_version,
      );
    }
  } else if (event.type === "pr.conflict_resolved") {
    if (!existing) return;

    const newResolutionCount = existing.resolution_count + 1;
    const newActiveStreak = 0;

    const avgDuration = db
      .prepare(
        `SELECT AVG(duration_seconds) AS avg_s
         FROM ${lifecycleTable}
         WHERE pr_number = ? AND state = 'resolved' AND duration_seconds IS NOT NULL`,
      )
      .get(prNumber) as { avg_s: number | null } | undefined;

    const pressure = computePressureScore(
      existing.conflict_count,
      newActiveStreak,
      existing.cooldown_breaches,
      avgDuration?.avg_s ?? null,
    );

    db.prepare(
      `UPDATE ${table}
       SET resolution_count = ?, active_streak = ?, pressure_score = ?,
           last_seen_at = ?, aggregate_version = ?
       WHERE pr_number = ?`,
    ).run(
      newResolutionCount,
      newActiveStreak,
      pressure,
      event.ts,
      event.aggregate_version,
      prNumber,
    );
  }
}

/** Pressure function (mismos pesos que conflict-trajectory.ts). */
function computePressureScore(
  conflictCount: number,
  activeStreak: number,
  cooldownBreaches: number,
  durationMeanS: number | null,
): number {
  const durationH = durationMeanS != null ? durationMeanS / 3600 : 0;
  return (
    conflictCount * 1.0 +
    activeStreak * 1.8 +
    cooldownBreaches * 2.5 +
    durationH
  );
}

// ── Replay alerting (R1 + R6: parámetro now, sin side effects) ──

/**
 * Evalúa reglas de alerting para replay.
 * Escribe a decision_log (o decision_log_replay si shadow).
 * NO genera notificaciones (R6).
 * Usa parámetro `now` en vez de Date.now()/datetime('now') (R1).
 */
function replayEvaluateAlertRules(
  db: Database.Database,
  now: string,
  suffix = "",
): number {
  seedAlertRules();
  ensureDecisionLogTable();

  const decisionTable = `decision_log${suffix}`;
  const alertTable = `alert${suffix}`;
  let decisions = 0;

  const rules = db
    .prepare("SELECT * FROM alert_rule WHERE enabled = 1")
    .all() as Array<{ id: string; threshold: string; cooldown_s: number }>;

  for (const rule of rules) {
    const threshold = JSON.parse(rule.threshold) as Record<string, number>;

    switch (rule.id) {
      case "conflict_duration": {
        const openConflicts = db
          .prepare(
            `SELECT pr_number, title, detected_at,
                    CAST((julianday(?) - julianday(detected_at)) * 86400 AS INTEGER) AS age_s
             FROM conflict_lifecycle${suffix}
             WHERE state = 'entered'`,
          )
          .all(now) as Array<{ pr_number: number; title: string; detected_at: string; age_s: number }>;

        for (const c of openConflicts) {
          const dedupeKey = `conflict_duration:${c.pr_number}`;
          const aboveThreshold = c.age_s > (threshold.seconds ?? 3600);
          const inCooldown = isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, now);
          const triggered = aboveThreshold && !inCooldown;

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `⚠️ PR #${c.pr_number} en conflicto hace ${Math.round(c.age_s / 60)}min: ${c.title}`;
            if (!suffix) {
              alertId = insertAlertReturnId(db, alertTable, rule.id, dedupeKey, "warning", msg, now);
            }
          }

          try {
            db.prepare(
              `INSERT OR IGNORE INTO ${decisionTable}
               (rule_id, evaluated_at, entity_kind, entity_ref, state_snapshot,
                pressure_snapshot, threshold, triggered, alert_id, dedupe_key, message)
               VALUES (?, ?, 'pr', ?, ?, NULL, ?, ?, ?, ?, ?)`,
            ).run(
              rule.id,
              now,
              String(c.pr_number),
              JSON.stringify({ title: c.title, detected_at: c.detected_at, age_s: c.age_s }),
              JSON.stringify(threshold),
              triggered ? 1 : 0,
              alertId,
              dedupeKey,
              msg,
            );
            decisions++;
          } catch {
            // skip
          }
        }
        break;
      }

      case "conflict_pressure": {
        const pressureThreshold = threshold.pressure ?? 8.0;
        const hotPressure = db
          .prepare(
            `SELECT t.pr_number, t.pressure_score, t.active_streak,
                    t.conflict_count, t.cooldown_breaches,
                    cl.title
             FROM conflict_trajectory${suffix} t
             LEFT JOIN conflict_lifecycle${suffix} cl
               ON cl.pr_number = t.pr_number AND cl.state = 'entered'
             WHERE t.pressure_score >= ?
             ORDER BY t.pressure_score DESC`,
          )
          .all(pressureThreshold) as Array<{
          pr_number: number;
          pressure_score: number;
          active_streak: number;
          conflict_count: number;
          cooldown_breaches: number;
          title: string | null;
        }>;

        for (const p of hotPressure) {
          const dedupeKey = `conflict_pressure:${p.pr_number}`;
          const title = p.title ?? `PR #${p.pr_number}`;
          const triggered = !isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, now);

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `🔴 PR #${p.pr_number} pressure ${p.pressure_score.toFixed(1)} ` +
              `(conflicts:${p.conflict_count} streak:${p.active_streak} breaches:${p.cooldown_breaches}): ${title}`;
            if (!suffix) {
              alertId = insertAlertReturnId(db, alertTable, rule.id, dedupeKey, "critical", msg, now);
            }
          }

          try {
            db.prepare(
              `INSERT OR IGNORE INTO ${decisionTable}
               (rule_id, evaluated_at, entity_kind, entity_ref, state_snapshot,
                pressure_snapshot, threshold, triggered, alert_id, dedupe_key, message)
               VALUES (?, ?, 'pr', ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              rule.id,
              now,
              String(p.pr_number),
              JSON.stringify({ title, conflict_count: p.conflict_count }),
              JSON.stringify({ pressure: p.pressure_score, active_streak: p.active_streak }),
              JSON.stringify(threshold),
              triggered ? 1 : 0,
              alertId,
              dedupeKey,
              msg,
            );
            decisions++;
          } catch {
            // skip
          }
        }
        break;
      }

      case "conflict_frequency": {
        const hotspots = db
          .prepare(
            `SELECT pr_number, title, COUNT(*) AS cnt
             FROM conflict_lifecycle${suffix}
             GROUP BY pr_number
             HAVING cnt >= ?`,
          )
          .all(threshold.count ?? 3) as Array<{ pr_number: number; title: string; cnt: number }>;

        for (const h of hotspots) {
          const dedupeKey = `conflict_freq:${h.pr_number}`;
          const triggered = !isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, now);

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `🔥 PR #${h.pr_number} con ${h.cnt} conflictos históricos: ${h.title}`;
            if (!suffix) {
              alertId = insertAlertReturnId(db, alertTable, rule.id, dedupeKey, "warning", msg, now);
            }
          }

          try {
            db.prepare(
              `INSERT OR IGNORE INTO ${decisionTable}
               (rule_id, evaluated_at, entity_kind, entity_ref, state_snapshot,
                pressure_snapshot, threshold, triggered, alert_id, dedupe_key, message)
               VALUES (?, ?, 'pr', ?, ?, NULL, ?, ?, ?, ?, ?)`,
            ).run(
              rule.id,
              now,
              String(h.pr_number),
              JSON.stringify({ title: h.title, count: h.cnt }),
              JSON.stringify(threshold),
              triggered ? 1 : 0,
              alertId,
              dedupeKey,
              msg,
            );
            decisions++;
          } catch {
            // skip
          }
        }
        break;
      }

      case "ci_persistent": {
        const latestPoll = db
          .prepare("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1")
          .get() as { ts: string } | undefined;
        if (!latestPoll) break;

        const ciRed = db
          .prepare(
            `SELECT number, title FROM pr_snapshot
             WHERE ts = ? AND ci_state = 'fail'`,
          )
          .all(latestPoll.ts) as Array<{ number: number; title: string }>;

        for (const pr of ciRed) {
          const dedupeKey = `ci_red:${pr.number}`;
          const triggered = !isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, now);

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `🔴 PR #${pr.number} CI en rojo: ${pr.title}`;
            if (!suffix) {
              alertId = insertAlertReturnId(db, alertTable, rule.id, dedupeKey, "critical", msg, now);
            }
          }

          try {
            db.prepare(
              `INSERT OR IGNORE INTO ${decisionTable}
               (rule_id, evaluated_at, entity_kind, entity_ref, state_snapshot,
                pressure_snapshot, threshold, triggered, alert_id, dedupe_key, message)
               VALUES (?, ?, 'pr', ?, ?, NULL, ?, ?, ?, ?, ?)`,
            ).run(
              rule.id,
              now,
              String(pr.number),
              JSON.stringify({ title: pr.title, ci_state: "fail" }),
              JSON.stringify(threshold),
              triggered ? 1 : 0,
              alertId,
              dedupeKey,
              msg,
            );
            decisions++;
          } catch {
            // skip
          }
        }
        break;
      }

      case "system_health": {
        const stats = db
          .prepare(
            `SELECT key, value FROM system_snapshot
             WHERE key IN ('status', 'api_error_rate')`,
          )
          .all() as Array<{ key: string; value: string }>;

        const statusEntry = stats.find((s) => s.key === "status");
        const isCritical = statusEntry && JSON.parse(statusEntry.value) === "critical";
        const dedupeKey = "system:critical";
        const triggered = isCritical && !isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, now);

        let alertId: number | null = null;
        let msg: string | null = null;
        if (triggered) {
          msg = `🔴 System Health: CRITICAL`;
          if (!suffix) {
            alertId = insertAlertReturnId(db, alertTable, rule.id, dedupeKey, "critical", msg, now);
          }
        }

        try {
          db.prepare(
            `INSERT OR IGNORE INTO ${decisionTable}
             (rule_id, evaluated_at, entity_kind, entity_ref, state_snapshot,
              pressure_snapshot, threshold, triggered, alert_id, dedupe_key, message)
             VALUES (?, ?, 'system', 'health', ?, NULL, ?, ?, ?, ?, ?)`,
          ).run(
            rule.id,
            now,
            JSON.stringify({ status: isCritical ? "critical" : "ok" }),
            JSON.stringify(threshold),
            triggered ? 1 : 0,
            alertId,
            dedupeKey,
            msg,
          );
          decisions++;
        } catch {
          // skip
        }
        break;
      }
    }
  }

  return decisions;
}

// ── Helpers ──

function isInCooldown(
  db: Database.Database,
  ruleId: string,
  dedupeKey: string,
  cooldownS: number,
  now: string,
): boolean {
  const last = db
    .prepare(
      `SELECT opened_at FROM alert
       WHERE rule_id = ? AND dedupe_key = ?
       ORDER BY opened_at DESC LIMIT 1`,
    )
    .get(ruleId, dedupeKey) as { opened_at: string } | undefined;

  if (!last) return false;
  const diffS = (Date.parse(now) - Date.parse(last.opened_at)) / 1000;
  return diffS < cooldownS;
}

/** Inserta alerta y devuelve el id (o null si duplicada). */
function insertAlertReturnId(
  db: Database.Database,
  table: string,
  ruleId: string,
  dedupeKey: string,
  severity: string,
  message: string,
  now: string,
): number | null {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO ${table} (rule_id, dedupe_key, severity, message, status, opened_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    )
    .run(ruleId, dedupeKey, severity, message, now);
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

function countTableRows(db: Database.Database, table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number };
    return row.cnt;
  } catch {
    return 0;
  }
}
