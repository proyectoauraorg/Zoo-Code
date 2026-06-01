// Projector: conflict_lifecycle — temporal conflict state machine (V2.f).
// Escucha pr.conflict y pr.conflict_resolved del event_log.
// Owner: historian.py (V2.d). Cuando V2.h llegue, el Projector formal hereda.

import { getDb } from "@/lib/db";

/** Proyecta un evento de conflicto en conflict_lifecycle. */
export function projectConflictEvent(event: {
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

  if (event.type === "pr.conflict") {
    // ENTER conflict
    db.prepare(
      `INSERT OR IGNORE INTO conflict_lifecycle
       (id, pr_number, state, event_id, aggregate_version, detected_at, title)
       VALUES (?, ?, 'entered', ?, ?, ?, ?)`,
    ).run(
      event.event_id,
      prNumber,
      event.event_id,
      event.aggregate_version,
      event.ts,
      (event.payload.title as string) ?? "",
    );
  } else if (event.type === "pr.conflict_resolved") {
    // RESOLVE conflict — encontrar el último "entered" sin resolver
    const last = db
      .prepare(
        `SELECT id, detected_at FROM conflict_lifecycle
         WHERE pr_number = ? AND state = 'entered'
         ORDER BY aggregate_version DESC LIMIT 1`,
      )
      .get(prNumber) as { id: string; detected_at: string } | undefined;

    if (!last) return;

    const detectedMs = Date.parse(last.detected_at);
    const resolvedMs = Date.parse(event.ts);
    const durationS =
      !Number.isNaN(detectedMs) && !Number.isNaN(resolvedMs)
        ? Math.max(0, Math.round((resolvedMs - detectedMs) / 1000))
        : null;

    db.prepare(
      `UPDATE conflict_lifecycle
       SET state = 'resolved', resolved_at = ?, duration_seconds = ?
       WHERE id = ?`,
    ).run(event.ts, durationS, last.id);
  }
}

/** Refresca conflict_lifecycle leyendo todos los eventos de conflicto del event_log. */
export function refreshConflictLifecycle(): number {
  const db = getDb();
  if (!db) return 0;

  // Reset
  db.prepare("DELETE FROM conflict_lifecycle").run();

  // Leer todos los eventos de conflicto ordenados
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
    projectConflictEvent({
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
