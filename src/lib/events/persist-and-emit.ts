// persistAndEmit — persiste eventos en event_log y emite al EventBus.
// Atómico: si la persistencia falla, no se emite nada.
// Nivel 1 (truth) → Nivel 4 (efímero).

import { getDb } from "@/lib/db";
import { eventBus } from "./event-bus";
import { makeEventId } from "./event-id";
import type { ZooEvent } from "./types";

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function persistAndEmit(
  events: ZooEvent[],
  source: "historian" | "backfill" | "manual" = "historian",
): { persisted: number; emitted: number } {
  const db = getDb();
  if (!db || events.length === 0) return { persisted: 0, emitted: 0 };

  const now = nowIso();
  let persisted = 0;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO event_log
     (event_id, schema_version, ts, ingested_at, source, type,
      entity_kind, entity_ref, payload, aggregate_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const txn = db.transaction(() => {
    for (const ev of events) {
      const eventId = makeEventId(
        source,
        ev.entity.kind,
        ev.entity.ref,
        ev.type,
        ev.ts,
      );

      // aggregate_version: siguiente para esta entidad
      const last = db
        .prepare(
          `SELECT MAX(aggregate_version) AS v
           FROM event_log
           WHERE entity_kind = ? AND entity_ref = ?`,
        )
        .get(ev.entity.kind, ev.entity.ref) as { v: number | null } | undefined;
      const aggVersion = (last?.v ?? 0) + 1;

      const result = insert.run(
        eventId,
        ev.schema_version ?? 1,
        ev.ts,
        now,
        source,
        ev.type,
        ev.entity.kind,
        ev.entity.ref,
        JSON.stringify(ev.payload),
        aggVersion,
      );
      if (result.changes > 0) persisted++;
    }
  });

  try {
    txn();
  } catch {
    return { persisted: 0, emitted: 0 };
  }

  // Emitir al EventBus solo si se persistió algo
  if (persisted > 0) {
    for (const ev of events) {
      const entityMap: Record<string, ZooEventSignal["entity"]> = {
        pr: "prs",
        issue: "issues",
        system: "system",
      };
      eventBus.emitChange({
        entity: entityMap[ev.entity.kind] ?? "overview",
        ids: [Number(ev.entity.ref)].filter((n) => !Number.isNaN(n)),
        ts: ev.ts,
      });
    }
  }

  return { persisted, emitted: persisted };
}

import type { ZooEventSignal } from "./event-bus";
