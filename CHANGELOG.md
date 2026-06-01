# Changelog

Todas las notas de release de ZooDash. Este proyecto sigue
[Versionado Semántico](https://semver.org/lang/es/) y
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

<!-- Formato:
## [X.Y.Z] — AAAA-MM-DD
### Added / Changed / Deprecated / Removed / Fixed / Security
-->

## [Unreleased]

### Added
- _(próximo feature: v3 Predictive Conflict)_

---

## [1.4.0] — 2026-05-30

### Added — V2.i: Conflict Tracker Fase B (git merge-tree, Heat Graph, Age Risk)

- **`src/lib/conflict/merge-tree-parser.ts`** — Parser de `git merge-tree`:
  - [`parseMergeTreeOutput()`](src/lib/conflict/merge-tree-parser.ts) — extrae paths de `CONFLICT (content)` y `changed in both`.
  - [`normalizeZone()`](src/lib/conflict/merge-tree-parser.ts) — zona = 2 niveles de profundidad.
  - [`classifyRisk()`](src/lib/conflict/merge-tree-parser.ts) — low/medium/high/critical.
- **`src/lib/projector/conflict-file.ts`** — Projector V2.i:
  - [`refreshConflictFileHotspots(db)`](src/lib/projector/conflict-file.ts) — conflict_file → conflict_hotspot con paths reales. Fallback V2.f si vacío.
  - [`refreshConflictHeat(db)`](src/lib/projector/conflict-file.ts) — agregación por zona → tabla `conflict_heat`.
  - [`refreshConflictAgeRisk(db, now?)`](src/lib/projector/conflict-file.ts) — scoring: `age×0.4 + files×0.3 + zone×0.3`.
  - [`projectConflictFiles(db, now?)`](src/lib/projector/conflict-file.ts) — ejecuta los tres en orden.
- **`src/components/ConflictFileTable.tsx`** — Tabla de hotspots con paths reales.
- **`src/components/HeatGraph.tsx`** — Visualización de zonas con barras proporcionales.
- **`src/components/AgeRiskBadge.tsx`** — Badge coloreado según nivel de riesgo.
- **`ingest/conflict_enricher.py`** — Enricher Python:
  - `git fetch` + `git merge-tree` sobre clon read-only (`~/.cache/zoodash/repo.git`).
  - Solo para PRs con `mergeable=CONFLICTING`.
  - Parser tolerante con regex múltiples patrones.
  - Degrade graceful si git no disponible.
- **`src/lib/__tests__/merge-tree-parse.test.ts`** — 12 tests del parser + zone + risk.
- **`src/lib/__tests__/age-risk.test.ts`** — 9 tests del scoring.

### Changed

- **`ingest/schema.sql`** — añadido: `conflict_file`, `conflict_heat`, `conflict_age_risk`.
- **`src/lib/db.ts`** — añadido [`ensureConflictTables()`](src/lib/db.ts).
- **`src/lib/projector/index.ts`** — integrado `projectConflictFiles` en el pipeline de projectors.
- **`src/app/api/conflicts/route.ts`** — response ampliado con `files[]`, `heat[]`, `ageRisk[]`. Backward compatible.
- **`src/app/conflicts/page.tsx`** — vista ampliada con `AgeRiskBadge`, `ConflictFileTable`, `HeatGraph`.

---

## [1.3.0] — 2026-05-30

### Added — V2.h: Decision Log + Replay Engine + Parity Checker

- **`src/lib/alerting/decision-log.ts`** — Decision Log model:
  - `DecisionRecord` interface — trazabilidad completa de decisiones del alerting engine.
  - `recordDecision()` — persiste cada evaluación de regla con state_snapshot, pressure_snapshot, threshold, triggered.
  - `getRecentDecisions()` — consulta de auditoría.
  - Backward compatible: si `decision_log` no existe, skip silencioso.
- **`src/lib/replay/engine.ts`** — Replay Engine determinista:
  - `executeReplay()` — reconstruye todo el estado derivado desde `event_log`.
  - Pipeline topológico: `event_log → conflict_lifecycle → conflict_trajectory → alerting → decision_log`.
  - Tres modos: `live` (destruye y reconstruye), `shadow` (tablas `_replay` aisladas), `dryRun` (solo contar).
  - `globalOrder()` — orden determinista: `ts → aggregate_version → event_id`.
  - Shadow tables: `conflict_lifecycle_replay`, `conflict_trajectory_replay`, `alert_replay`, `decision_log_replay`.
- **`src/lib/replay/parity-checker.ts`** — Alert Parity Checker (dos niveles):
  - `checkParity()` — Nivel 1 (structural): compara lifecycle + trajectory live vs `_replay`.
  - `checkParity()` — Nivel 2 (semantic): compara `decision_log` vs `decision_log_replay` (triggered, message, pressure).
  - `verifyReplayIntegrity()` — atajo: replay shadow + parity check completo.
- **`src/lib/replay/index.ts`** — barrel exports del módulo replay.
- **`POST /api/replay`** — ejecuta replay shadow + parity check (admin endpoint).
- **`GET /api/replay/status`** — info del event_log + decision_log.
- **`src/lib/__tests__/replay-determinism.test.ts`** — 15 tests de determinismo:
  - `globalOrder`: consistencia, prioridad ts, tie-break event_id, reflexividad, orden total.
  - Contratos de tipos: `ReplayOptions`, `ReplayResult`, `ParityResult`, `DecisionRecord`.
- **`ingest/backfill_decision_log.py`** — backfill de decision_log desde event_log.

### Changed

- **`src/lib/db.ts`** — añadido `getDbWritable()` (conexión read-write con WAL + FK) y `ensureDecisionLogTable()`.
- **`src/lib/events/types.ts`** — `EventBase` extendido con `correlation_id?` y `causation_id?` (V2.h causal layer).
- **`src/lib/alerting/engine.ts`** — endurecido para Determinism Contract:
  - Parámetro `now?: string` en `evaluateAlertRules()` — reemplaza `datetime('now')` en SQL (R1).
  - Integración con `recordDecision()` después de cada evaluación de regla.
  - `insertAlert()` retorna `lastInsertRowid` para vincular con decision_log.
- **`ingest/schema.sql`** — añadido:
  - Tabla `decision_log` con índices (rule, entity, triggered).
  - Columnas `correlation_id` y `causation_id` en `event_log`.
  - Índice `idx_event_correlation`.

### Determinism Contract Compliance (R1–R6)

| Regla | Estado | Verificación |
|---|---|---|
| R1 — Sin clock global | ✅ | `now` como parámetro, `julianday(?)` en SQL |
| R2 — Sin randomness | ✅ | Ninguna fuente de entropía en projectors |
| R3 — Sin cross-queries | ✅ | Solo event_log + proyecciones propias |
| R4 — Orden ts ASC, id ASC | ✅ | `readEventsInRange()` ORDER BY ts ASC, id ASC |
| R5 — Idempotencia | ✅ | INSERT OR IGNORE en todas las escrituras |
| R6 — Sin side effects en replay | ✅ | Alerting en replay solo escribe a decision_log |

---

## [1.2.0] — 2026-05-30

### Added — V2.g: Alerting Engine

- **`src/lib/alerting/engine.ts`** — motor de evaluación de reglas declarativas:
  - `evaluateAlertRules()` — evalúa 4 reglas contra projections/event_log.
  - `seedAlertRules()` — siembra reglas por defecto en DB.
  - `getOpenAlerts()`, `getAllAlerts()`, `resolveAlert()` — CRUD de alertas.
  - Anti-spam: dedupe key + cooldown configurable por regla.
- **4 reglas por defecto:**
  - `conflict_duration` — conflicto abierto > 1h (cooldown 1h)
  - `conflict_frequency` — PR con ≥3 conflictos históricos (cooldown 24h)
  - `ci_persistent` — CI roja en último poll (cooldown 12h)
  - `system_health` — System Health CRITICAL (cooldown 5min)
- **Tablas `alert_rule` + `alert`** en schema.sql — reglas configurables + alertas
  con dedupe key, severity, status (open/resolved).
- **`GET /api/alerts`** — evalúa reglas + devuelve alertas.
- **`POST /api/alerts`** — resolver alerta por ID.
- **Vista `/alerts`** — tabla de alertas abiertas con botón "Resolver" + historial resueltas.
- **Navegación** — enlace "🔔 Alerts" en sidebar, drawer móvil y header.

---

## [1.1.0] — 2026-05-30

### Added — V2.f: Conflict Tracker A (temporal conflict state machine)

- **`conflict_lifecycle` table** en schema.sql — lifecycle de conflictos con
  `state` (entered/resolved), `detected_at`, `resolved_at`, `duration_seconds`,
  `aggregate_version` para orden determinista.
- **`src/lib/projector/conflict-lifecycle.ts`** — projector que escucha
  `pr.conflict` y `pr.conflict_resolved` del event_log → actualiza
  `conflict_lifecycle`. `refreshConflictLifecycle()` reconstruye desde event_log.
- **`GET /api/conflicts`** — endpoint con conflictos abiertos, resueltos y hotspots
  (PRs más conflictivos históricamente con avg/max duración).
- **Vista `/conflicts`** — tabla de conflictos abiertos + tabla de hotspots con
  badges de duración y frecuencia.
- **Navegación** — enlace "⚔️ Conflicts" en sidebar, drawer móvil y header.

---

## [1.0.0] — 2026-05-30

### Added — V2.e.1-2: Tiempo Real (SSE + useRealtime)

- **`GET /api/stream`** — SSE endpoint con heartbeat cada 15s. Push de eventos
  `changed { entity, ids, ts }` a los clientes conectados.
- **`src/lib/useRealtime.ts`** — hook que conecta `EventSource` a `/api/stream`
  y ejecuta `invalidateQueries([entity])` en TanStack Query.
- **`RealtimeBridge`** en `Providers` — componente puente que activa SSE
  globalmente. Si SSE falla, TanStack sigue con `refetchInterval` (fallback).
- **Latencia típica ~1-2s** (vs 60s polling anterior).
- **Cero dependencias nuevas** — SSE es nativo del browser (`EventSource`).

---

## [0.9.0] — 2026-05-30

### Added — EventBus Integration (Int.1-4): event_log + persistAndEmit + projection trigger

- **`src/lib/events/types.ts`** — discriminated union `ZooEvent` con 9 tipos:
  `pr.new`, `pr.merged`, `pr.state_changed`, `pr.ci_red`, `pr.ci_green`,
  `pr.conflict`, `issue.new`, `issue.closed`, `system.poll_completed`.
- **`src/lib/events/event-id.ts`** — `makeEventId()` determinista para dedupe.
- **`src/lib/events/event-bus.ts`** — `EventBus` singleton (Node.js EventEmitter)
  con `emitChange()`. Nivel 4 en jerarquía de verdad (efímero, acelerador).
- **`src/lib/events/persist-and-emit.ts`** — `persistAndEmit()` atómico:
  1. INSERT en event_log (con `aggregate_version`), 2. emit al EventBus,
  3. projectors se disparan por listener. Misma transacción SQLite.
- **`src/lib/events/projection-listener.ts`** — `startProjectionListener()`:
  escucha EventBus con debounce 1s → dispara `runProjectors()`.
- **`src/lib/events/index.ts`** — barrel export del módulo events.
- **`event_log` table** en schema.sql — append-only, `UNIQUE(event_id)`,
  `aggregate_version` monótono por entidad, indexes por entity/type/ts.
- **`projection_checkpoint` table** en schema.sql — para replay incremental.
- **Source of truth contract** — event_log es nivel 1 (truth), todo lo demás
  es nivel 2-4 (derived, reconstruible).

### Changed
- [`ingest/schema.sql`](ingest/schema.sql) — +tablas `event_log`, `projection_checkpoint`.

---

## [0.8.0] — 2026-05-30

### Added — V2.d.2: Read Models materializados

- **`contributor_summary`** (SQLite) — tabla materializada con PRs opened/merged/closed,
  cycle-time p50/p90, commit share %, last active, schema_version (ADR-10).
- **`conflict_hotspot`** (SQLite) — tabla materializada con PRs en conflicto acumulados
  (times) y last_seen. Preparada para v2.i (git merge-tree).
- **`system_snapshot`** (SQLite) — tabla materializada con métricas clave del sistema
  (poll_count, pr_count, contributor_count, conflict_count, snapshot_age) como JSON.
- **`src/lib/projector/`** — 3 projectors TypeScript:
  - `contributor-summary.ts` — `refreshContributorSummary()` lee de pr_snapshot + pr_author.
  - `conflict-hotspot.ts` — `refreshConflictHotspot()` lee PRs CONFLICTING.
  - `system-snapshot.ts` — `refreshSystemSnapshot()` compone métricas de salud.
  - `index.ts` — `runProjectors()` ejecuta los 3 y devuelve conteos.
- **`ingest/refresh_read_models.py`** — script Python standalone para refrescar read models
  desde línea de comandos (idempotente, igual que historian.py).
- **Ownership explícito:** historian.py es propietario de los read models en V2.d.
  El Projector formal (V2.h) heredará la propiedad.

---

## [0.7.0] — 2026-05-30

### Added — V2.d.3: System Health

- **`GET /api/system-health`** — endpoint que compone señales de salud:
  snapshot age, DB latency, historian lag, API stats (latencia/errors por endpoint),
  recursos (RAM, heap, disco), y estado global (healthy/degraded/critical).
- **Vista `/system`** — panel SRE con:
  - Status global (🟢/🟡/🔴) con uptime y snapshot freshness.
  - 4 tarjetas KPI: DB status, error rate, memoria, disco libre.
  - Tabla de latencias por endpoint con requests, errors y error rate.
- **`src/lib/system-health.ts`** — `buildSystemHealth()` y `computeStatus()`:
  regla de decisión que determina healthy/degraded/critical basándose en
  invariantes operacionales (no sumas arbitrarias).
- **Tipos** `SystemHealthData`, `SystemStatus`, `SnapshotHealth`, `DbHealth`,
  `HistorianHealth`, `ApiHealth`, `ResourceHealth` en `types.ts`.
- **Navegación** — enlace "⚙️ System" en sidebar, drawer móvil y header.

### Changed
- [`nav.ts`](src/lib/nav.ts) — +enlace a `/system`.
- [`AppHeader.tsx`](src/components/AppHeader.tsx) — título para `/system`.

---

## [0.6.0] — 2026-05-30

### Added — V2.d.4: Instrumentación interna

- **`src/lib/metrics.ts`** — módulo de instrumentación:
  - `recordRequest()` — registra latencia y errores por endpoint.
  - `getApiStats()` — devuelve stats acumulados (avgLatency, requests, errors, errorRate).
  - `getResourceMetrics()` — RSS, heapUsed, heapTotal, uptime del proceso.
  - `getDiskFreeMb()` — espacio libre en disco (data/).
  - `timed()` / `timedSync()` — wrappers para medir latencia de operaciones.
  - `persistMetrics()` — persiste métricas a `internal_metric` en SQLite.
- **`src/lib/api-middleware.ts`** — wrapper `withMetrics()` que captura latencia
  y errores automáticamente en cada Route Handler.
- **Tabla `internal_metric`** en `ingest/schema.sql` — almacén de métricas internas.
- **Todas las 7 API routes** envueltas con `withMetrics()`:
  `/api/health`, `/api/overview`, `/api/prs`, `/api/issues`,
  `/api/contributors`, `/api/discord`, `/api/search`.

---

## [0.5.0] — 2026-05-30

### Added — V2.d.1: Repository Pattern (driver SQLite)

- **`src/lib/repo/types.ts`** — 7 interfaces (`MetricRepo`, `PrRepo`, `EventRepo`,
  `ContributorRepo`, `DiscordRepo`, `SnapshotRepo`, `HealthRepo`) + `RepoContext`.
- **`src/lib/repo/sqlite/index.ts`** — implementación SQLite que envuelve las
  funciones existentes de `queries.ts` y `snapshots.ts` en async.
- **`src/lib/repo/index.ts`** — factory `makeRepos(ctx?)` con flag `DB_DRIVER`
  (default: `sqlite`). Placeholder para driver Postgres.
- **Migradas las 7 API routes** a usar `makeRepos()`:
  `/api/health`, `/api/overview`, `/api/prs`, `/api/issues`,
  `/api/contributors`, `/api/discord`, `/api/search`.
- **Contratos JSON inmutables** — ninguna respuesta de API cambió.

### Changed
- Todas las API routes ahora son `async` y usan `makeRepos()` en vez de
  importar funciones directas de `queries.ts`/`snapshots.ts`.

---

## [0.4.1] — 2026-05-30

### Added — Diseño de V2.d (Repository Pattern + Postgres + Read Models + System Health)

- **Spec técnica completa** en [`docs/v2/V2D_SPEC.md`](docs/v2/V2D_SPEC.md) — cubre:
  - **V2.d.1** Repository Pattern con 7 interfaces, `RepoContext`, factory con flag `DB_DRIVER`
  - **V2.d.2** Read Models materializados con `schema_version` (ADR-10), ownership en `historian.py`
  - **V2.d.3** System Health extendido con `DbHealth`, `SnapshotHealth`, `HistorianHealth`,
    `ApiHealth` (contadores requests/errors por endpoint), `ResourceHealth` (RAM, heap, CPU, disco)
  - **V2.d.4** Instrumentación con contadores `api_requests_total`/`api_errors_total`
  - Plan de migración Strangler Fig (dual-driver → backfill → paridad → cutover)
  - Orden revisado: V2.d.1 → V2.d.4 → V2.d.3 → V2.d.2

---

## [0.4.0] — 2026-05-30

### Added — V2.c: Discord Panel

- **Vista `/discord`** — Health Score de intake, gráfica de actividad por día
  (Tremor SparkAreaChart), top canales, top usuarios.
- **`GET /api/discord`** — combina datos historizados de `discord_activity` con
  el snapshot vivo; determina frescura (48h threshold).
- **Historización de Discord** en `historian.py` — `ingest_discord()` lee
  `discord.json` e inserta en `discord_activity` (idempotente con `INSERT OR IGNORE`).
- **Parser Zod de Discord** en `snapshots.ts` — `readDiscordSnapshot()` con
  degradación elegante (mismo patrón que github.json).
- **Queries de Discord** en `queries.ts` — `getDiscordByChannel()`,
  `getDiscordByUser()`, `getDiscordSeries()`, `getDiscordLastActivity()`,
  `getDiscordTotal()`.
- **Tipos** `DiscordChannel`, `DiscordUser`, `DiscordSeriesPoint`,
  `DiscordResponse` en `types.ts`.
- **Componente `DiscordChart`** — sparkline de actividad diaria (Tremor).
- **Navegación** — enlace "💬 Discord" en sidebar, drawer móvil y header.

### Changed
- [`nav.ts`](src/lib/nav.ts) — +enlace a `/discord`.
- [`AppHeader.tsx`](src/components/AppHeader.tsx) — título para `/discord`.
- [`historian.py`](ingest/historian.py) — +`ingest_discord()`, lectura de
  `DISCORD_SNAPSHOT`, historización integrada en el CLI.

---

## [0.3.0] — 2026-05-30

### Added — V2.b + V2.b.1: Contributor Analytics (básico + avanzado)

**V2.b — Contributor Analytics básico:**
- **Vista `/contributors`** — tabla de contribuidores con PRs abiertos, mergeados,
  cerrados, CI roja, conflictos, cuota (% del total) y Bus Factor badge.
- **`GET /api/contributors`** — combina datos historizados (tabla `contributor`)
  con PRs abiertos actuales del snapshot vivo.
- **Tablas `contributor` y `pr_author`** en schema.sql — seguimiento de autores
  con upsert idempotente en cada poll del historian.
- **Campo `actor`** en parser Zod (`snapshots.ts`) y en `historian.py` — extrae
  login del creador del PR del snapshot cuando está disponible.
- **Script `ingest/backfill_authors.py`** — backfill de autores vía GitHub REST
  API pública (sin token, 60 req/hora) para poblar la tabla `contributor` inicial.
- **Queries `getContributors()` y `getOpenPrsByAuthor()`** en `queries.ts`.
- **Tipos** `ContributorStats`, `ContributorsResponse` en `types.ts`.
- **Badge de Bus Factor** — alerta visual cuando un autor concentra ≥50% de PRs.
- **Navegación** — enlace "👥 Contributors" en sidebar, drawer móvil y header.

**V2.b.1 — Métricas avanzadas (sobre SQLite):**
- **Cycle-time p50/p90** por autor — desde `pr_snapshot.created_at`/`merged_at`.
- **Bus Factor real** — cuántos autores cubren el 50% de PRs, con distribución.
- **Tarjetas KPI** en `/contributors` — Bus Factor, top autor, distribución visual.
- **`getCycleTimes()`**, `percentiles()`, `getBusFactor()`** en `queries.ts`.
- **Tipos** `BusFactorData` en `types.ts`.
- **Campos `created_at`/`merged_at`** en `pr_snapshot` (schema + historian).
- **Cycle-time badge** en la tabla — muestra p50 con tooltip p50/p90.

### Changed
- [`nav.ts`](src/lib/nav.ts) — añade enlace a `/contributors`.
- [`AppHeader.tsx`](src/components/AppHeader.tsx) — título para ruta `/contributors`.
- [`schema.sql`](ingest/schema.sql) — tablas `contributor` + `pr_author` + columnas `created_at`/`merged_at`.
- [`historian.py`](ingest/historian.py) — extrae `actor` + `created_at`/`merged_at` del snapshot.
- [`types.ts`](src/lib/types.ts) — `ContributorStats` con `cycleP50H`/`cycleP90H`, `BusFactorData`.

---

## [0.2.0] — 2026-05-30

### Added — V2.a: Command Palette (⌘K / Ctrl+K)

- **Command Palette** universal con `cmdk` (headless, accesible):
  - **Navegación** — saltar a Overview, PR Board, Issues sin ratón.
  - **Búsqueda** — buscar PRs (#100, "fix", "merge") e issues con debounce 300ms;
    ranking por coincidencia de número y título; abre en GitHub al seleccionar.
  - **Acciones** — refrescar datos, cambiar tema (dark/light/system), abrir upstream.
  - **Operaciones** — placeholders deshabilitados para Replay (`v2.h`) y Alerting (`v2.g`).
- `GET /api/search?q=&limit=` — endpoint de búsqueda sobre el snapshot vivo.
- Hook `useHotkey()` — atajos de teclado globales reutilizables (ignora inputs).
- Tipos `SearchResult`, `ContributorResult`, `SearchResponse`.
- Dependencia `cmdk@1.1.1` (~3KB gzipped).

### Changed
- [`layout.tsx`](src/app/layout.tsx) — monta `<CommandPalette />` a nivel raíz.

### Fixed
- Corregido import no usado (`POLL_REFRESH_MS`) en CommandPalette.

---

## [0.1.0] — 2026-05-20

### Added — v1: Zoo Code Control Plane

- **Dashboard operativo local** (Next.js 14 + App Router):
  - **Overview** (`/`) — KPIs, sparkline de tendencia, feed de actividad, badge de drift.
  - **PR Board** (`/prs`) — Kanban 5 columnas (Draft → Review → Changes Requested →
    Approved → Merged) con aging badge, CI badge, conflict badge.
  - **Issues** (`/issues`) — tabla con filtro por estado (ALL/OPEN/CLOSED).
- **API Routes** (`/api/overview`, `/api/prs`, `/api/issues`, `/api/health`).
- **Ingesta** (`ingest/historian.py`) — append idempotente a SQLite + cálculo de eventos
  (transiciones de estado, CI roja, conflictos).
- **Schema SQL** (`ingest/schema.sql`) — tablas `poll`, `repo_metric`, `pr_snapshot`,
  `issue_snapshot`, `pr_event`, `discord_activity`.
- **Parser Zod** (`src/lib/snapshots.ts`) — validación tolerante con degradación elegante.
- **Design tokens** — CSS variables dark-first con Tailwind, tokens semánticos.
- **Accesibilidad** — skip-link, aria-*, sr-only, prefers-reduced-motion, focus-trap.
- **Tema** — toggle dark/light/system con script sin-FOUC.
- **Mobile** — drawer de navegación para <sm.
- **Skeletons** — placeholders de carga con shimmer.
- **Tests** — Vitest (kanban.ts, snapshots.ts) con fixtures.
- **Deploy** — launchd plist para historian cada 15 min.

---

<!-- Links de comparación (se actualizan al crear tags) -->
[Unreleased]: https://github.com/Zoo-Code-Org/ZooDash/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Zoo-Code-Org/ZooDash/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Zoo-Code-Org/ZooDash/releases/tag/v0.1.0
