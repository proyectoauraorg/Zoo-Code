# ZooDash — Estado consolidado del roadmap

> **Última actualización:** 2026-05-30 | **Versión:** v1.4.0
> **Arquitectura:** Deterministic Temporal Event Compiler with replay verification + conflict file tracking

---

## Releases (14)

| # | Release | Fase | Fecha | Contenido |
|---|---------|------|-------|-----------|
| 1 | `v0.1.0` | v1 | 2026-05-20 | Control Plane inicial (SQLite, dashboard, historian, 3 vistas) |
| 2 | `v0.2.0` | V2.a | 2026-05-30 | Command Palette (⌘K, búsqueda, acciones) |
| 3 | `v0.3.0` | V2.b | 2026-05-30 | Contributor Analytics + cycle-time p50/p90 + Bus Factor |
| 4 | `v0.4.0` | V2.c | 2026-05-30 | Discord Panel (Health Score, top canales/usuarios) |
| 5 | `v0.4.1` | V2.d | 2026-05-30 | Spec completa: Repository + Postgres + Read Models + System Health |
| 6 | `v0.5.0` | V2.d.1 | 2026-05-30 | Repository Pattern (7 interfaces, SQLite driver, factory) |
| 7 | `v0.6.0` | V2.d.4 | 2026-05-30 | Instrumentación (latencia, contadores, recursos, withMetrics) |
| 8 | `v0.7.0` | V2.d.3 | 2026-05-30 | System Health (endpoint, panel SRE, computeStatus) |
| 9 | `v0.8.0` | V2.d.2 | 2026-05-30 | Read Models (contributor_summary, conflict_hotspot, system_snapshot) |
| 10 | `v0.9.0` | EM v1 | 2026-05-30 | Event Model (event_log, ZooEvent union, persistAndEmit, projection listener) |
| 11 | `v1.0.0` | V2.e | 2026-05-30 | Tiempo Real (SSE endpoint, useRealtime, RealtimeBridge) |
| 12 | `v1.2.0` | V2.g | 2026-05-30 | Alerting Engine (5 reglas, dedupe/cooldown, vista Alerts) |
| 13 | `v1.3.0` | V2.h | 2026-05-30 | Decision Log + Replay Engine + Parity Checker (R1-R6 compliance) |
| 14 | `v1.4.0` | V2.i | 2026-05-30 | Conflict Tracker Fase B (git merge-tree, conflict_file, Heat Graph, Age Risk) |

---

## Specs de diseño (4)

| Doc | Fase | Contenido clave |
|-----|------|-----------------|
| [`V2D_SPEC.md`](v2/V2D_SPEC.md) | V2.d | Repository Pattern, RepoContext, Postgres driver, Read Models, System Health, migración Strangler Fig |
| [`V2E_SPEC.md`](v2/V2E_SPEC.md) | V2.e | SSE endpoint, useRealtime hook, Event Coalescing (750ms), fallback polling |
| [`EVENT_MODEL_V1.md`](v2/EVENT_MODEL_V1.md) | EM v1 | ZooEvent discriminated union (9 tipos), event_id determinista, schema_version, upcasting, replay foundation |
| [`EVENTBUS_INTEGRATION.md`](v2/EVENTBUS_INTEGRATION.md) | Int. | persistAndEmit atómico, aggregate_version, projection_checkpoint, source of truth contract |
| [`V2H_SPEC.md`](v2/V2H_SPEC.md) | V2.h | Decision Log, Replay Engine, Parity Checker (structural + semantic), migration 8 pasos, 6 ADRs |
| [`REPLAY_DETERMINISM_CONTRACT.md`](v2/REPLAY_DETERMINISM_CONTRACT.md) | V2.h | Contrato normativo R1–R6, Projection DAG, global ordering, replay isolation, determinism linting |

---

## Documentación de análisis (6)

| Doc | Contenido |
|-----|-----------|
| [`analysis/01-VISION-GENERAL.md`](analysis/01-VISION-GENERAL.md) | Visión general, analogía del tablero de instrumentos, estructura de carpetas |
| [`analysis/02-STACK-Y-DEPENDENCIAS.md`](analysis/02-STACK-Y-DEPENDENCIAS.md) | 9 deps prod + 8 dev, roles, justificación de cada decisión |
| [`analysis/03-ARQUITECTURA.md`](analysis/03-ARQUITECTURA.md) | Diagrama de flujo, 4 capas, flujo de ejecución completo |
| [`analysis/04-PATRONES-CONVENCIONES.md`](analysis/04-PATRONES-CONVENCIONES.md) | 5 patrones, convenciones de código, modelo de datos |
| [`analysis/05-MEJORAS-VULNERABILIDADES-DEUDA.md`](analysis/05-MEJORAS-VULNERABILIDADES-DEUDA.md) | 3 vulnerabilidades, 9 deudas, 10 mejoras, análisis módulo a módulo |
| [`analysis/06-RESUMEN-GLOSARIO.md`](analysis/06-RESUMEN-GLOSARIO.md) | Calificaciones por dimensión, glosario de 30 términos |

---

## Arquitectura v1.0.0

```
4 capas desacopladas:
  L1 → event_log        (truth — append-only, auditable, replayable)
  L2 → base tables      (derived — pr_snapshot, issue_snapshot, etc.)
  L3 → read models      (optimized — contributor_summary, conflict_hotspot, system_snapshot)
  L4 → realtime layer   (accelerator — EventBus → SSE → browser)

7 vistas UI:
  Overview · PR Board · Contributors · Discord · Issues · System · Command Palette

9 API endpoints:
  /api/overview · /api/prs · /api/issues · /api/contributors
  /api/discord · /api/search · /api/health · /api/system-health · /api/stream

9 tipos de eventos:
  pr.new · pr.merged · pr.state_changed · pr.ci_red · pr.ci_green · pr.conflict
  issue.new · issue.closed · system.poll_completed
```

---

## Roadmap pendiente

| Fase | Contenido | Riesgo | Valor |
|------|-----------|--------|-------|
| V2.f | Conflict Tracker A (mergeable=CONFLICTING en el tiempo) | Bajo | Medio |
| V2.g | Alerting Engine (reglas → alert → Apprise, dedupe+cooldown) | Bajo-Medio | Muy alto |
| V2.h | Event Store + JetStream + Projector formal + Replay CLI | Alto | Muy alto |
| V2.i | Conflict Tracker B (git merge-tree, hotspots, Heat Graph) | Alto | Alto |

---

## Invariantes formalizados

### 1. Event Ordering Guarantee

Orden por agregado (no global):

```
∀ event e1, e2:
  si e1.aggregate_id == e2.aggregate_id
  y e1.aggregate_version = e2.aggregate_version - 1
  entonces e1 precede a e2
```

**Implementación:** `UNIQUE(aggregate_id, aggregate_version)` en event_log + validación en `persistAndEmit()`:

```sql
SELECT MAX(aggregate_version) FROM event_log WHERE aggregate_id = ?
-- new_version debe ser max + 1
```

### 2. Projection Idempotency Contract

Projection P es correcta si: `P(S, e) aplicado N veces → mismo S final`

**Dos estrategias válidas:**
- **UPSERT determinista:** `INSERT ... ON CONFLICT DO UPDATE WHERE version > last_version`
- **CHECKPOINT por projector:** `projection_checkpoint.last_version` + ignorar si `event.version <= checkpoint`

### 3. Replay Boundary Definition

| Nivel | Tablas | Propiedad |
|-------|--------|-----------|
| 🔴 L1 — Source of Truth | `event_log` | Replay total, nunca derivado, nunca reescrito |
| 🟡 L2 — Derived State | `pr_snapshot`, `issue_snapshot`, `discord_activity` | Replay selectivo desde event_log |
| 🟢 L3 — Read Models | `contributor_summary`, `conflict_hotspot`, `system_snapshot` | Rebuildable cache, borrables, regenerables |

**Invariante:** `∀ estado S: S ≡ f(event_log)` donde L1 es canonical y L2-L3 son materialized views.

---

## V2.f — Conflict Tracker A (diseño)

"Temporal Conflict State Machine sobre event_log"

### Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS conflict_lifecycle (
  id TEXT PRIMARY KEY,
  pr_id INTEGER NOT NULL,
  state TEXT NOT NULL,                    -- "entered" | "resolved"
  event_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  duration_seconds INTEGER,
  UNIQUE(pr_id, aggregate_version)
);
```

### State machine

```
pr.normal → pr.conflict → [tiempo] → pr.conflict_resolved
```

### Projector

Escucha `pr.conflict` y `pr.conflict_resolved` del EventBus → actualiza `conflict_lifecycle` → calcula duración.

### Valor habilitado

- PRs más conflictivos históricamente
- Duración promedio/máxima de conflictos
- Autores que generan más conflictos
- Hotspots temporales (últimos 7 días)
- Habilita directamente V2.g Alerting: `IF conflict_duration > 3600s THEN alert`

---

## Evaluaciones recibidas (resumen)

| Release | Evaluación | Nota clave |
|---------|-----------|------------|
| V2.d | 9.2/10 | Repository Pattern antes de Postgres = decisión correcta |
| V2.d.1 | — | Strangler Fig correcto, contratos JSON inmutables |
| V2.d.4 | — | Instrumentación transforma el sistema de "diseñado" a "medido" |
| V2.d.3 | — | System Health vigila al propio ZooDash |
| V2.d.2 | — | CQRS ligero con read models materializados |
| V2.e | — | Push invalidation model, coalescing es lo más importante |
| EM v1 | — | Event-sourced-lite real, SQLite como event store es válido |
| EventBus Integration | — | Dual-path propagation model correcto |
| v1.0.0 | 8.8/10 | Embedded event-sourced analytics engine |
