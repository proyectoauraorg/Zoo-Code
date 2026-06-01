# ZooDash — EventBus + event_log Integration Spec

> **Estado:** Diseño — no implementado.
> **Objetivo:** Cómo el EventBus (V2.e) deja de ser efímero y se convierte en
> un projection trigger determinista alimentado por event_log (EM v1).

---

## 1. Problema actual

```
V2.e (efímero):
  historian → EventBus.emit("changed") → SSE → browser
  └── si el proceso muere, el evento se pierde
  └── si hay 2 consumidores, ambos reciben (pero no hay persistencia)

EM v1 (persistido):
  historian → event_log.append(event) → permanece para siempre
  └── pero no dispara nada automáticamente
```

**Gap:** event_log persiste eventos, pero no los propaga al read path.

---

## 2. Diseño de integración

### 2.1 Flujo unificado

```
historian.py
  ↓ detecta cambios
  ↓ genera ZooEvent[]
  ↓
persistAndEmit(events):
  ├── 1. INSERT INTO event_log (determinista, idempotente)
  ├── 2. emitToEventBus(events)  → SSE → browser
  └── 3. triggerProjectors(events) → refresca read models

Todo dentro de la MISMA transacción SQLite.
```

### 2.2 Contract

```typescript
// src/lib/events/persist-and-emit.ts

import { getDb } from "@/lib/db";
import { eventBus } from "@/lib/event-bus";
import { makeEventId } from "@/lib/events/event-id";
import type { ZooEvent } from "@/lib/events/types";

/**
 * Persiste eventos en event_log, los emite al EventBus y dispara projectors.
 * Todo atómico: si la persistencia falla, no se emite nada.
 */
export function persistAndEmit(
  events: ZooEvent[],
  source: "historian" | "backfill" | "manual",
): { persisted: number; emitted: number } {
  const db = getDb();
  if (!db || events.length === 0) return { persisted: 0, emitted: 0 };

  const now = new Date().toISOString();
  let persisted = 0;

  // 1. Persistir (atómico con la transacción del historian)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO event_log
     (event_id, schema_version, ts, ingested_at, source, type,
      entity_kind, entity_ref, payload, aggregate_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const ev of events) {
    const eventId = makeEventId(
      source,
      ev.entity.kind,
      ev.entity.ref,
      ev.type,
      ev.ts,
    );

    // Calcular aggregate_version (siguiente para esta entidad)
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

  // 2. Emitir al EventBus (solo si se persistió algo)
  if (persisted > 0) {
    for (const ev of events) {
      eventBus.emit("changed", {
        entity: ev.entity.kind as any,
        ids: [Number(ev.entity.ref)].filter((n) => !Number.isNaN(n)),
        ts: ev.ts,
      });
    }
  }

  // 3. Projectors se disparan por el EventBus (listener separado)

  return { persisted, emitted: persisted };
}
```

### 2.3 Listener de projectors

```typescript
// src/lib/events/projection-listener.ts

import { eventBus } from "@/lib/event-bus";
import { runProjectors } from "@/lib/projector";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Listener que dispara projectors cuando llegan eventos.
 * Debounce de 1s para no disparar projectors por cada evento individual.
 */
export function startProjectionListener() {
  eventBus.on("changed", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runProjectors();
      debounceTimer = null;
    }, 1000);
  });
}
```

---

## 3. aggregate_version (orden por entidad)

### 3.1 Schema update

```sql
ALTER TABLE event_log ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_event_aggregate
  ON event_log(entity_kind, entity_ref, aggregate_version);
```

### 3.2 Semántica

```
event_log para PR #388:
  id=1  aggregate_version=1  type=pr.new      ts=2026-05-01
  id=5  aggregate_version=2  type=pr.ci_red   ts=2026-05-02
  id=8  aggregate_version=3  type=pr.merged   ts=2026-05-03
```

- `aggregate_version` es **monótono creciente por entidad** (kind + ref).
- Permite **replay determinista**: reconstruir estado de PR #388 = aplicar v1, v2, v3 en orden.
- Permite **optimistic concurrency**: si dos writers intentan v3, uno falla (UNIQUE constraint).

---

## 4. Checkpointing de replay

### 4.1 Problema

Sin checkpointing, `replayAll()` lee TODOS los eventos cada vez. Con 100K eventos → O(n) costoso.

### 4.2 Solución: projection_checkpoint

```sql
CREATE TABLE IF NOT EXISTS projection_checkpoint (
    projection_name TEXT PRIMARY KEY,    -- 'contributor_summary' | 'conflict_hotspot' | ...
    last_event_id   INTEGER NOT NULL,    -- último event_log.id procesado
    last_ts         TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

### 4.3 Replay incremental

```typescript
export function replayIncremental(projectionName: string): number {
  const db = getDb();
  if (!db) return 0;

  const checkpoint = db
    .prepare("SELECT last_event_id FROM projection_checkpoint WHERE projection_name = ?")
    .get(projectionName) as { last_event_id: number } | undefined;

  const fromId = checkpoint?.last_event_id ?? 0;

  // Solo eventos nuevos desde el último checkpoint
  const events = db
    .prepare("SELECT * FROM event_log WHERE id > ? ORDER BY id ASC")
    .all(fromId) as EventRow[];

  for (const row of events) {
    applyEventToProjection(db, projectionName, row);
  }

  // Actualizar checkpoint
  if (events.length > 0) {
    const lastId = events[events.length - 1].id;
    db.prepare(
      `INSERT OR REPLACE INTO projection_checkpoint
       (projection_name, last_event_id, last_ts, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(projectionName, lastId, events[events.length - 1].ts, now_iso());
  }

  return events.length;
}
```

### 4.4 Replay completo (rebuild)

```typescript
export function replayFull(projectionName: string): number {
  const db = getDb();
  if (!db) return 0;

  // Reset checkpoint
  db.prepare("DELETE FROM projection_checkpoint WHERE projection_name = ?")
    .run(projectionName);

  // Reset read model
  db.prepare(`DELETE FROM ${projectionName}`).run();

  // Replay all events
  return replayIncremental(projectionName);
}
```

---

## 5. Source of truth contract

### 5.1 Regla de oro

```
event_log es la FUENTE DE VERDAD.
Todo lo demás es DERIVADO y RECONSTRUIBLE.
```

### 5.2 Jerarquía de verdad

```
Nivel 1 (truth):     event_log
Nivel 2 (derived):   base tables (pr_snapshot, issue_snapshot, etc.)
Nivel 3 (derived):   read models (contributor_summary, etc.)
Nivel 4 (derived):   EventBus signals (efímeras, no son verdad)
```

### 5.3 Invariantes

| Invariante | Cómo se verifica |
|-----------|-----------------|
| event_log es append-only | No hay DELETE ni UPDATE en event_log |
| read models son derivables | replay(event_log) == read model actual |
| base tables son derivables | replay(event_log) == base table actual |
| EventBus no es fuente de verdad | Si se pierde un evento, el sistema sigue funcionando |

---

## 6. Orden de implementación

```
Int.1  aggregate_version en event_log
       ├── ALTER TABLE event_log
       ├── persistAndEmit() calcula agg_version
       └── Test: orden por entidad es determinista

Int.2  persistAndEmit() en historian
       ├── historian.py genera ZooEvent[]
       ├── persistAndEmit() → event_log + EventBus
       └── Dual-write: base tables + event_log (misma transacción)

Int.3  Projection listener
       ├── startProjectionListener() → debounce → runProjectors()
       └── Projectors leen de event_log (no de base tables)

Int.4  Checkpointing
       ├── projection_checkpoint table
       ├── replayIncremental() vs replayFull()
       └── Test: incremental == full sobre mismos datos

Int.5  Contrato de verdad
       ├── Documentar invariantes
       ├── Test de paridad: replay == read models
       └── Test de paridad: replay == base tables
```

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Doble escritura (base + event_log) | Misma transacción SQLite; atomicidad garantizada |
| aggregate_version collision | UNIQUE(entity_kind, entity_ref, aggregate_version) |
| Replay lento sin checkpoint | checkpointing incremental (Int.4) |
| EventBus pierde señales | No importa: event_log es la verdad, EventBus es acelerador |
| Projectors disparados antes de persistir | persistAndEmit() persiste PRIMERO, emite DESPUÉS |

---

## 8. Qué NO introduce esta integración

- ❌ Event Store externo (eso es V2.h)
- ❌ JetStream/NATS (eso es V2.h)
- ❌ Multi-consumidor (eso es V2.h)
- ❌ Real-time event streaming desde event_log (eso ya es V2.e)

Esta integración es **solo** el puente entre persistencia (EM v1) e invalidación (V2.e).
