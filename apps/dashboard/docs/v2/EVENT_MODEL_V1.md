# ZooDash Event Model v1.0 — De invalidación a event-sourced-lite

> **Estado:** Diseño — no implementado.
> **Autoridad:** Este documento extiende V2.e (invalidation) hacia un modelo
> de eventos persistidos, tipados y versionados, sin romper SQLite ni introducir
> Event Store externo.
>
> **ADR aplicados:** ADR-10 (schema_version), ADR-11 (plano de datos por fases),
> ADR-14 (Replay Engine).

---

## 1. Tesis

V2.e introduce eventos como **señales de invalidación** (`changed { entity, ids }`).
Event Model v1.0 los convierte en **registros persistidos, tipados y versionados**
que permiten:

1. **Auditar** qué pasó y cuándo.
2. **Replay** reconstruir read models desde cero.
3. **Debugging** reproducir problemas exactos.
4. **Migración** transicionar a Event Store formal (V2.h) sin reescribir.

**Sin romper SQLite.** Todo cabe en una tabla `event_log` dentro de la DB existente.

---

## 2. Evolución del modelo de eventos

```
ESTADO ACTUAL (V2.e)
  EventBus.emit("changed", { entity: "prs", ids: [388] })
  └── señal efímera, no persistida, sin historia

EVENT MODEL v1.0
  event_log.append({
    event_id: "gh:pr:388:merged:2026-05-30T12:00:00Z",
    schema_version: 1,
    type: "pr.merged",
    entity: { kind: "pr", ref: "388" },
    payload: { state: "MERGED", mergedAt: "..." },
    ts: "2026-05-30T12:00:00Z",
    source: "historian"
  })
  └── persistido, tipado, versionado, replayable
```

---

## 3. Tipado fuerte de eventos

### 3.1 Discriminated union

```typescript
// src/lib/events/types.ts

export interface EventBase {
  event_id: string;        // determinista: dedupe
  schema_version: number;  // upcasting
  ts: string;              // ISO-8601 UTC
  source: "historian" | "backfill" | "manual";
}

// ── PR events ──
export interface PrNewEvent extends EventBase {
  type: "pr.new";
  entity: { kind: "pr"; ref: string };
  payload: {
    number: number;
    title: string;
    author: string | null;
    state: string;
  };
}

export interface PrMergedEvent extends EventBase {
  type: "pr.merged";
  entity: { kind: "pr"; ref: string };
  payload: {
    number: number;
    mergedAt: string;
    cycleTimeH: number | null;
  };
}

export interface PrStateChangeEvent extends EventBase {
  type: "pr.state_changed";
  entity: { kind: "pr"; ref: string };
  payload: {
    number: number;
    from: string;
    to: string;
    reviewDecision: string;
  };
}

export interface PrCiRedEvent extends EventBase {
  type: "pr.ci_red";
  entity: { kind: "pr"; ref: string };
  payload: { number: number; failed: number };
}

export interface PrCiGreenEvent extends EventBase {
  type: "pr.ci_green";
  entity: { kind: "pr"; ref: string };
  payload: { number: number };
}

export interface PrConflictEvent extends EventBase {
  type: "pr.conflict";
  entity: { kind: "pr"; ref: string };
  payload: { number: number };
}

export interface PrConflictResolvedEvent extends EventBase {
  type: "pr.conflict_resolved";
  entity: { kind: "pr"; ref: string };
  payload: { number: number };
}

// ── Issue events ──
export interface IssueNewEvent extends EventBase {
  type: "issue.new";
  entity: { kind: "issue"; ref: string };
  payload: { number: number; title: string };
}

export interface IssueClosedEvent extends EventBase {
  type: "issue.closed";
  entity: { kind: "issue"; ref: string };
  payload: { number: number };
}

// ── System events ──
export interface SystemPollCompletedEvent extends EventBase {
  type: "system.poll_completed";
  entity: { kind: "system"; ref: "poll" };
  payload: {
    prs: number;
    issues: number;
    events: number;
    durationMs: number;
  };
}

export interface SystemHealthChangedEvent extends EventBase {
  type: "system.health_changed";
  entity: { kind: "system"; ref: "health" };
  payload: {
    from: "healthy" | "degraded" | "critical";
    to: "healthy" | "degraded" | "critical";
  };
}

// ── Union type ──
export type ZooEvent =
  | PrNewEvent
  | PrMergedEvent
  | PrStateChangeEvent
  | PrCiRedEvent
  | PrCiGreenEvent
  | PrConflictEvent
  | PrConflictResolvedEvent
  | IssueNewEvent
  | IssueClosedEvent
  | SystemPollCompletedEvent
  | SystemHealthChangedEvent;

/** Helper: extrae el entity type del evento. */
export function entityOf(ev: ZooEvent): string {
  return `${ev.entity.kind}:${ev.entity.ref}`;
}

/** Helper: determina qué queryKeys invalidar. */
export function affectedQueryKeys(ev: ZooEvent): string[] {
  const keys: string[] = ["overview"];
  if (ev.entity.kind === "pr") keys.push("prs");
  if (ev.entity.kind === "issue") keys.push("issues");
  if (ev.type.startsWith("pr.") && ev.payload && "author" in ev.payload) {
    keys.push("contributors");
  }
  if (ev.type.startsWith("system.")) keys.push("system-health");
  return [...new Set(keys)];
}
```

### 3.2 Event ID determinista

```typescript
// src/lib/events/event-id.ts

/**
 * Genera un event_id determinista para dedupe.
 * Formato: "{source}:{entity_kind}:{entity_ref}:{type}:{ts}"
 *
 * Ejemplo: "historian:pr:388:pr.merged:2026-05-30T12:00:00Z"
 *
 * Si el historian corre dos veces con el mismo poll, produce el mismo event_id → no duplica.
 */
export function makeEventId(
  source: string,
  entityKind: string,
  entityRef: string,
  type: string,
  ts: string,
): string {
  return `${source}:${entityKind}:${entityRef}:${type}:${ts}`;
}
```

---

## 4. event_log table (SQLite)

```sql
-- Event log — append-only, auditable, idempotente (ADR-10, ADR-11).
-- La verdad del sistema. Los read models son proyecciones derivadas.
CREATE TABLE IF NOT EXISTS event_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,           -- determinista → dedupe
    schema_version  INTEGER NOT NULL DEFAULT 1,     -- upcasting v(n)→v(n+1)
    ts              TEXT NOT NULL,                   -- ISO-8601 UTC: cuándo ocurrió
    ingested_at     TEXT NOT NULL,                   -- ISO-8601 UTC: cuándo se insertó
    source          TEXT NOT NULL,                   -- historian | backfill | manual
    type            TEXT NOT NULL,                   -- pr.new | pr.merged | ...
    entity_kind     TEXT NOT NULL,                   -- pr | issue | system
    entity_ref      TEXT NOT NULL,                   -- "388" | "poll" | "health"
    payload         TEXT NOT NULL                    -- JSON serializado
);
CREATE INDEX IF NOT EXISTS idx_event_entity ON event_log(entity_kind, entity_ref, ts DESC);
CREATE INDEX IF NOT EXISTS idx_event_type_ts ON event_log(type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_event_ts ON event_log(ts);
```

### 4.1 Idempotencia

`UNIQUE(event_id)` + `INSERT OR IGNORE` garantiza que re-ingestar el mismo poll
no duplica eventos. El `event_id` es determinista (mismo source + entity + type + ts
→ mismo id).

### 4.2 Crecimiento estimado

| Poll | Eventos/poll | Polls/día | Eventos/día | Eventos/mes |
|------|-------------|-----------|-------------|-------------|
| Normal | 5-10 | 96 | ~720 | ~21,600 |
| Activo | 20-50 | 96 | ~2,400 | ~72,000 |

SQLite maneja millones de filas sin problemas. Retención: configurable (p.ej., 180 días).

---

## 5. Versionado de eventos (ADR-10)

### 5.1 Principio

Cada evento lleva `schema_version`. Cuando el esquema de un tipo de evento cambia
(nuevo campo, campo renombrado), se incrementa la versión. El lector aplica
**upcasting** para transformar v(n)→v(n+1) en memoria.

### 5.2 Ejemplo

```typescript
// src/lib/events/upcasters.ts

/** Upcast pr.merged v1 → v2: añade cycleTimeH si falta. */
function upcastPrMergedV1toV2(ev: any): PrMergedEvent {
  if (ev.schema_version >= 2) return ev;
  return {
    ...ev,
    schema_version: 2,
    payload: {
      ...ev.payload,
      cycleTimeH: ev.payload.cycleTimeH ?? null,
    },
  };
}

/** Upcast chain: aplica todos los upcasters en orden. */
export function upcast(ev: any): ZooEvent {
  let result = ev;
  if (result.type === "pr.merged") {
    result = upcastPrMergedV1toV2(result);
  }
  // Añadir más upcasters aquí según se necesiten
  return result as ZooEvent;
}
```

### 5.3 Regla

- **Nunca modificar** un evento ya persistido.
- **Siempre** añadir campos nuevos como opcionales con defaults.
- **Nunca** eliminar campos (deprecate + ignorar en upcaster).

---

## 6. Replay Foundation (ADR-14)

### 6.1 Principio

Los read models son **proyecciones derivadas** del event_log. Si se borran,
se pueden reconstruir re-proyectando todos los eventos.

```typescript
// src/lib/events/replay.ts

/**
 * Reconstruye todos los read models desde event_log.
 * Equivale a: DELETE FROM read models + re-proyectar cada evento.
 * Idempotente: re-proyectar N veces da el mismo resultado.
 */
export function replayAll(): { events: number; durationMs: number } {
  const db = getDb();
  if (!db) return { events: 0, durationMs: 0 };

  const start = performance.now();

  // 1. Leer todos los eventos ordenados por ts
  const events = db
    .prepare("SELECT * FROM event_log ORDER BY ts ASC, id ASC")
    .all() as EventRow[];

  // 2. Resetear read models
  db.exec("DELETE FROM contributor_summary");
  db.exec("DELETE FROM conflict_hotspot");
  db.exec("DELETE FROM system_snapshot");

  // 3. Re-proyectar cada evento
  for (const row of events) {
    const ev = upcast(JSON.parse(row.payload));
    applyEventToReadModels(db, ev, row.ts);
  }

  const durationMs = Math.round(performance.now() - start);
  return { events: events.length, durationMs };
}
```

### 6.2 CLI

```bash
# Reconstruir read models desde event_log
python3 ingest/replay.py --from 2026-01-01 --to 2026-06-01

# Reconstruir todo (backfill completo)
python3 ingest/replay.py --all
```

---

## 7. Migración: de invalidation events a persisted events

### 7.1 Fase 1: Dual-write

El historian escribe **tanto** al event_log como emite eventos al EventBus:

```python
# historian.py — después de ingest()
def emit_events(conn, events, ts):
    """Persiste eventos en event_log Y los emite al EventBus (futuro)."""
    for ev in events:
        event_id = make_event_id("historian", ev["entity_kind"], ...)
        conn.execute(
            "INSERT OR IGNORE INTO event_log "
            "(event_id, schema_version, ts, ingested_at, source, type, "
            "entity_kind, entity_ref, payload) "
            "VALUES (?, 1, ?, ?, 'historian', ?, ?, ?, ?)",
            (event_id, ev["ts"], now_iso(), ev["type"],
             ev["entity_kind"], ev["entity_ref"], json.dumps(ev["payload"]))
        )
```

### 7.2 Fase 2: Backfill histórico

Convierte los `pr_event` existentes (V2.d) en `event_log`:

```bash
python3 ingest/backfill_events.py  # lee pr_event → escribe event_log
```

### 7.3 Fase 3: Cutover

Los read models se refrescan desde event_log (no desde base tables).
El EventBus se alimenta de event_log (no de señales efímeras).

---

## 8. Cómo encaja con el roadmap

```
V2.e   Event Bus (invalidation)     ← señales efímeras
EM v1  Event Model v1.0             ← persistencia + tipado + versionado
V2.h   Event Store formal           ← JetStream + projector formal
```

EM v1 es el **puente** entre V2.e (invalidation) y V2.h (event store formal).
Permite:

- **Auditar** sin Event Store.
- **Replay** sin JetStream.
- **Versionado** sin upcasting complejo.
- **Migrar** a Event Store sin reescribir.

---

## 9. Orden de implementación

```
EM v1.1  Tipado de eventos
         ├── src/lib/events/types.ts (discriminated union)
         ├── src/lib/events/event-id.ts (determinista)
         └── src/lib/events/upcasters.ts (v1→v2 chain)

EM v1.2  event_log table + persistencia
         ├── event_log en schema.sql
         ├── historian.py escribe a event_log (dual-write)
         └── INSERT OR IGNORE + UNIQUE(event_id)

EM v1.3  Backfill histórico
         ├── pr_event → event_log (script de migración)
         └── Test de paridad (event_log == pr_event)

EM v1.4  Replay foundation
         ├── src/lib/events/replay.ts
         ├── ingest/replay.py (CLI)
         └── Test: replay(event_log) == read models actuales

EM v1.5  Integración con V2.e
         ├── EventBus se alimenta de event_log
         ├── useRealtime() usa affectedQueryKeys()
         └── Coalescing sobre typed events
```

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| event_log crece mucho | Retención configurable (180 días); compresión en V2.d (PG) |
| Upcasting incorrecto | Tests de upcasting con fixtures de cada versión |
| Replay lento con muchos eventos | Ventana temporal (--from/--to); batch inserts |
| Doble escritura (historian + event_log) | Misma transacción SQLite; atomicidad garantizada |
| Breaking change en event type | schema_version + upcasting; nunca modificar eventos existentes |

---

## 11. Qué NO introduce EM v1

- ❌ Event Store externo (eso es V2.h)
- ❌ JetStream/NATS (eso es V2.h)
- ❌ Projector formal como proceso separado (eso es V2.h)
- ❌ Real-time event streaming (eso ya es V2.e)
- ❌ Multi-consumidor (eso es V2.h)

EM v1 es **solo** la persistencia y tipado de eventos dentro de SQLite existente.
