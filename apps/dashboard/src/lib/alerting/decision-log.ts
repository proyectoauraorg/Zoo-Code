// Decision Log (V2.h) — persistencia de decisiones del alerting engine.
// Contract: V2H_SPEC.md §1.3. Cumple Determinism Contract R1 (no clock access).

import { getDbWritable, ensureDecisionLogTable } from "@/lib/db";

export interface DecisionRecord {
  ruleId: string;
  evaluatedAt: string;
  entityKind: string | null;
  entityRef: string | null;
  stateSnapshot: Record<string, unknown>;
  pressureSnapshot: Record<string, unknown> | null;
  threshold: Record<string, number>;
  triggered: boolean;
  alertId: number | null;
  dedupeKey: string | null;
  message: string | null;
}

/**
 * Registra una decisión en el decision_log.
 * Idempotente: UNIQUE(rule_id, entity_ref, evaluated_at) → INSERT OR IGNORE.
 * Backward compatible: si decision_log no existe, intenta crearlo; si falla, skip silencioso.
 */
export function recordDecision(record: DecisionRecord): void {
  try {
    const db = getDbWritable();
    if (!db) return;
    ensureDecisionLogTable();

    db.prepare(
      `INSERT OR IGNORE INTO decision_log
       (rule_id, evaluated_at, entity_kind, entity_ref, state_snapshot,
        pressure_snapshot, threshold, triggered, alert_id, dedupe_key, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.ruleId,
      record.evaluatedAt,
      record.entityKind,
      record.entityRef,
      JSON.stringify(record.stateSnapshot),
      record.pressureSnapshot ? JSON.stringify(record.pressureSnapshot) : null,
      JSON.stringify(record.threshold),
      record.triggered ? 1 : 0,
      record.alertId,
      record.dedupeKey,
      record.message,
    );
  } catch {
    // Backward compatible: si la tabla no existe o falla, skip silencioso
  }
}

/**
 * Devuelve decisiones recientes para auditoría.
 * Orden: más recientes primero.
 */
export function getRecentDecisions(limit = 50): DecisionRecord[] {
  try {
    const db = getDbWritable();
    if (!db) return [];
    ensureDecisionLogTable();

    const rows = db
      .prepare(
        `SELECT rule_id, evaluated_at, entity_kind, entity_ref,
                state_snapshot, pressure_snapshot, threshold,
                triggered, alert_id, dedupe_key, message
         FROM decision_log
         ORDER BY evaluated_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      rule_id: string;
      evaluated_at: string;
      entity_kind: string | null;
      entity_ref: string | null;
      state_snapshot: string;
      pressure_snapshot: string | null;
      threshold: string;
      triggered: number;
      alert_id: number | null;
      dedupe_key: string | null;
      message: string | null;
    }>;

    return rows.map((r) => ({
      ruleId: r.rule_id,
      evaluatedAt: r.evaluated_at,
      entityKind: r.entity_kind,
      entityRef: r.entity_ref,
      stateSnapshot: JSON.parse(r.state_snapshot) as Record<string, unknown>,
      pressureSnapshot: r.pressure_snapshot
        ? (JSON.parse(r.pressure_snapshot) as Record<string, unknown>)
        : null,
      threshold: JSON.parse(r.threshold) as Record<string, number>,
      triggered: r.triggered === 1,
      alertId: r.alert_id,
      dedupeKey: r.dedupe_key,
      message: r.message,
    }));
  } catch {
    return [];
  }
}
