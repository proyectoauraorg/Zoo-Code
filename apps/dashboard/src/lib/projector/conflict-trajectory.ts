// Projector: conflict_trajectory — temporal conflict dynamics (v1.2.1).
// Escucha pr.conflict y pr.conflict_resolved del event_log.
// Mantiene por-PR: counts, streak, cooldown breaches y pressure score.
// Owner: projector system. Cuando V2.h llegue, replay reconstruye esto.

import { getDb } from "@/lib/db";

// Cooldown window: si un conflicto nuevo llega dentro de este periodo
// tras una resolución, se cuenta como cooldown_breach.
const COOLDOWN_WINDOW_S = 24 * 3600; // 24 horas

// Pesos del modelo de presión (Conflict Pressure Function)
const W_CONFLICT_COUNT = 1.0;
const W_ACTIVE_STREAK = 1.8;
const W_COOLDOWN_BREACHES = 2.5;
const W_DURATION_MEAN_DIVISOR = 3600; // segundos → horas

interface TrajectoryRow {
  pr_number: number;
  conflict_count: number;
  resolution_count: number;
  active_streak: number;
  cooldown_breaches: number;
  pressure_score: number;
  first_seen_at: string;
  last_seen_at: string;
  aggregate_version: number;
}

/**
 * Calcula el pressure score dado los componentes de la trayectoria.
 * P(pr) = (conflict_count * 1.0) + (active_streak * 1.8)
 *        + (cooldown_breaches * 2.5) + (duration_mean_h)
 */
export function computePressureScore(
  conflictCount: number,
  activeStreak: number,
  cooldownBreaches: number,
  durationMeanS: number | null,
): number {
  const durationH = durationMeanS != null ? durationMeanS / W_DURATION_MEAN_DIVISOR : 0;
  return (
    conflictCount * W_CONFLICT_COUNT +
    activeStreak * W_ACTIVE_STREAK +
    cooldownBreaches * W_COOLDOWN_BREACHES +
    durationH
  );
}

/**
 * Proyecta un evento de conflicto en conflict_trajectory.
 * Incremental: actualiza la fila existente del PR o la crea.
 */
export function projectConflictTrajectory(event: {
  type: string;
  entity_ref: string;
  ts: string;
  event_id: string;
  aggregate_version: number;
  payload: Record<string, unknown>;
}): void {
  const db = getDb();
  if (!db) return;

  const prNumber = Number(event.entity_ref);
  if (Number.isNaN(prNumber)) return;

  const existing = db
    .prepare("SELECT * FROM conflict_trajectory WHERE pr_number = ?")
    .get(prNumber) as TrajectoryRow | undefined;

  if (event.type === "pr.conflict") {
    // Detectar cooldown breach: conflicto nuevo poco después de una resolución
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
        if (gapS >= 0 && gapS < COOLDOWN_WINDOW_S) {
          cooldownBreaches += 1;
        }
      }
    }

    const newConflictCount = (existing?.conflict_count ?? 0) + 1;
    const newActiveStreak = (existing?.active_streak ?? 0) + 1;

    // Duración media de conflictos resueltos previos (para el score)
    const avgDuration = db
      .prepare(
        `SELECT AVG(duration_seconds) AS avg_s
         FROM conflict_lifecycle
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
        `UPDATE conflict_trajectory
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
        `INSERT INTO conflict_trajectory
         (pr_number, conflict_count, resolution_count, active_streak,
          cooldown_breaches, pressure_score, first_seen_at, last_seen_at,
          aggregate_version)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      ).run(
        prNumber,
        newConflictCount,
        newActiveStreak,
        cooldownBreaches,
        pressure,
        event.ts,
        event.ts,
        event.aggregate_version,
      );
    }
  } else if (event.type === "pr.conflict_resolved") {
    if (!existing) return; // nada que resolver

    const newResolutionCount = existing.resolution_count + 1;
    // Reset streak al resolverse
    const newActiveStreak = 0;

    const avgDuration = db
      .prepare(
        `SELECT AVG(duration_seconds) AS avg_s
         FROM conflict_lifecycle
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
      `UPDATE conflict_trajectory
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

/**
 * Refresca conflict_trajectory leyendo TODOS los eventos de conflicto del event_log.
 * Idempotente: DELETE + replay completo.
 */
export function refreshConflictTrajectory(): number {
  const db = getDb();
  if (!db) return 0;

  // Reset
  db.prepare("DELETE FROM conflict_trajectory").run();

  // Leer todos los eventos de conflicto ordenados cronológicamente
  const events = db
    .prepare(
      `SELECT * FROM event_log
       WHERE type IN ('pr.conflict', 'pr.conflict_resolved')
       ORDER BY ts ASC, id ASC`,
    )
    .all() as Array<{
    event_id: string;
    type: string;
    entity_ref: string;
    ts: string;
    aggregate_version: number;
    payload: string;
  }>;

  for (const ev of events) {
    projectConflictTrajectory({
      type: ev.type,
      entity_ref: ev.entity_ref,
      ts: ev.ts,
      event_id: ev.event_id,
      aggregate_version: ev.aggregate_version,
      payload: JSON.parse(ev.payload),
    });
  }

  return events.length;
}

/**
 * Devuelve las trayectorias ordenadas por pressure_score descendente.
 */
export function getTopPressurePRs(limit = 20): TrajectoryRow[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT * FROM conflict_trajectory
       ORDER BY pressure_score DESC
       LIMIT ?`,
    )
    .all(limit) as TrajectoryRow[];
}

/**
 * Devuelve la trayectoria de un PR específico.
 */
export function getTrajectoryForPR(prNumber: number): TrajectoryRow | undefined {
  const db = getDb();
  if (!db) return undefined;
  return db
    .prepare("SELECT * FROM conflict_trajectory WHERE pr_number = ?")
    .get(prNumber) as TrajectoryRow | undefined;
}
