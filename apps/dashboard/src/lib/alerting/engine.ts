// Alerting Engine (V2.g) — evalúa reglas contra projections/event_log.
// Reusa Apprise (notify.ts) para notificaciones. Anti-spam: dedupe + cooldown.
// V2.h: acepta parámetro `now` (R1 del Determinism Contract) + registra decision_log.

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { recordDecision } from "./decision-log";

export interface AlertRule {
  id: string;
  enabled: boolean;
  threshold: Record<string, number>;
  cooldownS: number;
}

export interface AlertRow {
  id: number;
  ruleId: string;
  dedupeKey: string;
  severity: string;
  message: string;
  status: string;
  openedAt: string;
  notifiedAt: string | null;
  resolvedAt: string | null;
}

// Reglas por defecto (seed en DB si no existen)
const DEFAULT_RULES: AlertRule[] = [
  { id: "conflict_duration", enabled: true, threshold: { seconds: 3600 }, cooldownS: 3600 },
  { id: "conflict_frequency", enabled: true, threshold: { count: 3 }, cooldownS: 86400 },
  { id: "conflict_pressure", enabled: true, threshold: { pressure: 8.0 }, cooldownS: 3600 },
  { id: "ci_persistent", enabled: true, threshold: { fails: 3 }, cooldownS: 43200 },
  { id: "system_health", enabled: true, threshold: { errorRate: 10 }, cooldownS: 300 },
];

/** Seed reglas por defecto si no existen. */
export function seedAlertRules(): void {
  const db = getDb();
  if (!db) return;
  for (const rule of DEFAULT_RULES) {
    db.prepare(
      `INSERT OR IGNORE INTO alert_rule (id, enabled, threshold, cooldown_s)
       VALUES (?, ?, ?, ?)`,
    ).run(rule.id, rule.enabled ? 1 : 0, JSON.stringify(rule.threshold), rule.cooldownS);
  }
}

/**
 * Evalúa todas las reglas activas y crea alertas nuevas.
 * @param now — ISO-8601 timestamp. Si no se proporciona, usa Date.now() (solo live mode).
 *              En modo replay, se pasa como parámetro para cumplir R1 del Determinism Contract.
 */
export function evaluateAlertRules(now?: string): Array<{ ruleId: string; dedupeKey: string; message: string }> {
  const db = getDb();
  if (!db) return [];

  seedAlertRules();

  const rules = db
    .prepare("SELECT * FROM alert_rule WHERE enabled = 1")
    .all() as Array<{ id: string; threshold: string; cooldown_s: number }>;

  const effectiveNow = now ?? new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  const newAlerts: Array<{ ruleId: string; dedupeKey: string; message: string }> = [];

  for (const rule of rules) {
    const threshold = JSON.parse(rule.threshold) as Record<string, number>;

    switch (rule.id) {
      case "conflict_duration": {
        // Conflictos abiertos > threshold segundos
        // R1: reemplazar julianday('now') por parámetro
        const openConflicts = db
          .prepare(
            `SELECT pr_number, title, detected_at,
                    CAST((julianday(?) - julianday(detected_at)) * 86400 AS INTEGER) AS age_s
             FROM conflict_lifecycle
             WHERE state = 'entered'`,
          )
          .all(effectiveNow) as Array<{ pr_number: number; title: string; detected_at: string; age_s: number }>;

        for (const c of openConflicts) {
          const dedupeKey = `conflict_duration:${c.pr_number}`;
          const aboveThreshold = c.age_s > (threshold.seconds ?? 3600);
          const inCooldown = isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, effectiveNow);
          const triggered = aboveThreshold && !inCooldown;

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `⚠️ PR #${c.pr_number} en conflicto hace ${Math.round(c.age_s / 60)}min: ${c.title}`;
            alertId = insertAlert(db, rule.id, dedupeKey, "warning", msg, effectiveNow);
            newAlerts.push({ ruleId: rule.id, dedupeKey, message: msg });
          }

          tryRecordDecision({
            ruleId: rule.id,
            evaluatedAt: effectiveNow,
            entityKind: "pr",
            entityRef: String(c.pr_number),
            stateSnapshot: { title: c.title, detected_at: c.detected_at, age_s: c.age_s },
            pressureSnapshot: null,
            threshold,
            triggered,
            alertId,
            dedupeKey: triggered ? dedupeKey : null,
            message: msg,
          });
        }
        break;
      }

      case "conflict_pressure": {
        // PRs con pressure_score > threshold (modelo dinámico v1.2.1)
        const pressureThreshold = threshold.pressure ?? 8.0;
        const hotPressure = db
          .prepare(
            `SELECT t.pr_number, t.pressure_score, t.active_streak,
                    t.conflict_count, t.cooldown_breaches,
                    cl.title
             FROM conflict_trajectory t
             LEFT JOIN conflict_lifecycle cl
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
          const inCooldown = isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, effectiveNow);
          const triggered = !inCooldown;
          const title = p.title ?? `PR #${p.pr_number}`;

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `🔴 PR #${p.pr_number} pressure ${p.pressure_score.toFixed(1)} ` +
              `(conflicts:${p.conflict_count} streak:${p.active_streak} breaches:${p.cooldown_breaches}): ${title}`;
            alertId = insertAlert(db, rule.id, dedupeKey, "critical", msg, effectiveNow);
            newAlerts.push({ ruleId: rule.id, dedupeKey, message: msg });
          }

          tryRecordDecision({
            ruleId: rule.id,
            evaluatedAt: effectiveNow,
            entityKind: "pr",
            entityRef: String(p.pr_number),
            stateSnapshot: { title, conflict_count: p.conflict_count, active_streak: p.active_streak },
            pressureSnapshot: { pressure: p.pressure_score, cooldown_breaches: p.cooldown_breaches },
            threshold,
            triggered,
            alertId,
            dedupeKey: triggered ? dedupeKey : null,
            message: msg,
          });
        }
        break;
      }

      case "conflict_frequency": {
        // PRs con > threshold conflictos históricos
        const hotspots = db
          .prepare(
            `SELECT pr_number, title, COUNT(*) AS cnt
             FROM conflict_lifecycle
             GROUP BY pr_number
             HAVING cnt >= ?`,
          )
          .all(threshold.count ?? 3) as Array<{ pr_number: number; title: string; cnt: number }>;

        for (const h of hotspots) {
          const dedupeKey = `conflict_freq:${h.pr_number}`;
          const inCooldown = isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, effectiveNow);
          const triggered = !inCooldown;

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `🔥 PR #${h.pr_number} con ${h.cnt} conflictos históricos: ${h.title}`;
            alertId = insertAlert(db, rule.id, dedupeKey, "warning", msg, effectiveNow);
            newAlerts.push({ ruleId: rule.id, dedupeKey, message: msg });
          }

          tryRecordDecision({
            ruleId: rule.id,
            evaluatedAt: effectiveNow,
            entityKind: "pr",
            entityRef: String(h.pr_number),
            stateSnapshot: { title: h.title, count: h.cnt },
            pressureSnapshot: null,
            threshold,
            triggered,
            alertId,
            dedupeKey: triggered ? dedupeKey : null,
            message: msg,
          });
        }
        break;
      }

      case "ci_persistent": {
        // PRs con CI roja persistente
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
          const inCooldown = isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, effectiveNow);
          const triggered = !inCooldown;

          let alertId: number | null = null;
          let msg: string | null = null;
          if (triggered) {
            msg = `🔴 PR #${pr.number} CI en rojo: ${pr.title}`;
            alertId = insertAlert(db, rule.id, dedupeKey, "critical", msg, effectiveNow);
            newAlerts.push({ ruleId: rule.id, dedupeKey, message: msg });
          }

          tryRecordDecision({
            ruleId: rule.id,
            evaluatedAt: effectiveNow,
            entityKind: "pr",
            entityRef: String(pr.number),
            stateSnapshot: { title: pr.title, ci_state: "fail" },
            pressureSnapshot: null,
            threshold,
            triggered,
            alertId,
            dedupeKey: triggered ? dedupeKey : null,
            message: msg,
          });
        }
        break;
      }

      case "system_health": {
        // Error rate > threshold
        const stats = db
          .prepare(
            `SELECT key, value FROM system_snapshot
             WHERE key IN ('status', 'api_error_rate')`,
          )
          .all() as Array<{ key: string; value: string }>;

        const statusEntry = stats.find((s) => s.key === "status");
        const isCritical = !!(statusEntry && JSON.parse(statusEntry.value) === "critical");
        const dedupeKey = "system:critical";
        const inCooldown = isInCooldown(db, rule.id, dedupeKey, rule.cooldown_s, effectiveNow);
        const triggered: boolean = isCritical && !inCooldown;

        let alertId: number | null = null;
        let msg: string | null = null;
        if (triggered) {
          msg = `🔴 System Health: CRITICAL`;
          alertId = insertAlert(db, rule.id, dedupeKey, "critical", msg, effectiveNow);
          newAlerts.push({ ruleId: rule.id, dedupeKey, message: msg });
        }

        tryRecordDecision({
          ruleId: rule.id,
          evaluatedAt: effectiveNow,
          entityKind: "system",
          entityRef: "health",
          stateSnapshot: { status: isCritical ? "critical" : "ok" },
          pressureSnapshot: null,
          threshold,
          triggered,
          alertId,
          dedupeKey: triggered ? dedupeKey : null,
          message: msg,
        });
        break;
      }
    }
  }

  return newAlerts;
}

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

/**
 * Inserta alerta y devuelve el id (o null si duplicada).
 * V2.h: modificado para retornar lastInsertRowid.
 */
function insertAlert(
  db: Database.Database,
  ruleId: string,
  dedupeKey: string,
  severity: string,
  message: string,
  now: string,
): number | null {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO alert (rule_id, dedupe_key, severity, message, status, opened_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    )
    .run(ruleId, dedupeKey, severity, message, now);
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

/**
 * Registra decisión con try/catch para backward compatibility.
 * Si decision_log no existe, se degrade silenciosamente.
 */
function tryRecordDecision(
  record: Parameters<typeof recordDecision>[0],
): void {
  try {
    recordDecision(record);
  } catch {
    // Backward compatible: skip silencioso
  }
}

/** Devuelve alertas abiertas. */
export function getOpenAlerts(): AlertRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, rule_id, dedupe_key, severity, message, status,
              opened_at, notified_at, resolved_at
       FROM alert WHERE status = 'open'
       ORDER BY opened_at DESC`,
    )
    .all() as AlertRow[];
}

/** Devuelve todas las alertas (abiertas + resueltas recientes). */
export function getAllAlerts(limit = 50): AlertRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, rule_id, dedupe_key, severity, message, status,
              opened_at, notified_at, resolved_at
       FROM alert ORDER BY opened_at DESC LIMIT ?`,
    )
    .all(limit) as AlertRow[];
}

/** Resuelve una alerta por ID. */
export function resolveAlert(id: number): boolean {
  const db = getDb();
  if (!db) return false;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  const result = db
    .prepare("UPDATE alert SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'open'")
    .run(now, id);
  return result.changes > 0;
}
