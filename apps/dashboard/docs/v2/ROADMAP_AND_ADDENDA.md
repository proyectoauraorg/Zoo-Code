# ZooDash v2 — Roadmap revisado y addenda (v0.2)

> **Qué es esto:** integración de tres revisiones externas del dossier v2. Es la versión
> **autoritativa** del roadmap y de las decisiones; **supersede** el orden de fases del
> [README](./README.md) §3 y amplía [ARCHITECTURE](./ARCHITECTURE.md), [FEATURES](./FEATURES.md)
> y [TESTING](./TESTING_AND_SIMULATION.md). Sigue siendo **diseño — nada implementado.**
>
> **Tesis central de la revisión:** ZooDash hoy es un *dashboard operacional*, no un *sistema
> de procesamiento de eventos*. El 70–80% del valor para el operador llega **antes** con
> búsqueda universal + métricas de contribución + cuellos de botella, y con **<30% de la
> complejidad operativa**, si **diferimos** la infra pesada (JetStream/Event Store) hasta que
> aparezcan multi-consumidor, replay masivo o analítica derivada. El Event Sourcing sigue
> siendo la **arquitectura objetivo correcta**, pero **por fases**, no en el día 1.

---

## 1. Principio nuevo: "plano de datos por fases" (ADR-11)

En vez de saltar de SQLite a `webhook→NATS→event store→projector→Timescale→Redis→SSE` de un
golpe, el **Repository Pattern** (lo más valioso del dossier según los tres revisores) permite
**subir el plano de datos por escalones**, entregando features en cada uno:

```text
ESCALÓN 0 (hoy)     UI → repository → SQLite                       (v1, ya existe)
ESCALÓN 1           + features sobre SQLite (Palette, Contributor, Discord)
ESCALÓN 2           UI → repository → Postgres/Timescale            (cuando crezcan series/agregaciones)
ESCALÓN 3           + webhook → Postgres → Redis pub/sub → SSE      (tiempo real SIN JetStream todavía)
ESCALÓN 4           + Event Store + Projector formal + JetStream    (solo si multi-consumidor/replay/audit)
```

El frontend nunca cambia (mismos JSON tipados). Cada escalón es desplegable y reversible
(`DB_DRIVER`, flags). **JetStream/Event Store dejan de ser prerrequisito** y pasan a ser
Escalón 4, "cuando aporte ventaja medible".

## 2. Roadmap revisado (supersede README §3)

| Fase | Entrega | Plano | Valor / Riesgo |
|---|---|---|---|
| **V2.a** | **Command Palette** (Navigation/Search/Actions/Operations) | SQLite | muy alto / muy bajo |
| **V2.b** | **Contributor Analytics** (+ métricas avanzadas §6) | SQLite→PG | muy alto / medio |
| **V2.c** | **Discord Panel** (+ Health Score §8) | SQLite | alto / bajo |
| **V2.d** | **Postgres + Timescale** (driver repository) + **read models materializados** (§5) + **System Health** (§7) | PG | habilitador / medio |
| **V2.e** | **Tiempo real**: `webhook(gh forward) → Postgres → Redis pub/sub → SSE` + **Event Coalescing** (§9) | PG | alto / medio |
| **V2.f** | **Conflict Tracker — Fase A** (solo `mergeable=CONFLICTING` en el tiempo, sin clones) | PG | medio / bajo |
| **V2.g** | **Alerting Engine** (§4) — reusa Apprise | PG | muy alto / bajo |
| **V2.h** | **Event Store + JetStream + Projector formal + Replay Engine** (§3) | event-sourced | muy alto / alto |
| **V2.i** | **Conflict Tracker — Fase B** (`git merge-tree`, hotspots, Heat Graph, Age Risk §10) | event-sourced | alto / alto |
| **v3** | **Predictive Conflict** (solapamiento de archivos antes de CONFLICTING) | — | futuro |

> **Cambio clave vs dossier v0.1:** Event Sourcing/JetStream pasa de V2.0 (primero) a **V2.h**
> (tardío). Palette/Contributor/Discord se entregan **sobre el plano SQLite actual** vía el
> repository, sin infra nueva. Conflict se parte en A (barato) y B (caro).

## 3. Replay Engine (componente de primera clase) — ADR-14

Eleva el simulador de replay a herramienta operativa. CLI:

```bash
zoodash replay --from 2026-01-01 --to 2026-02-01 [--into postgres|sqlite] [--only metrics|contributors|all]
```

- **Fuente de verdad** = `event_log` (cuando exista, Escalón 4) o el histórico de snapshots
  (antes). Reconstruye proyecciones, métricas, series y read models **desde cero**.
- **Usos:** migración v1→v2 (backfill), **recalcular métricas con fórmula nueva** sin perder
  nada (time-travel), y **recuperación** si una proyección se corrompe (borrar→reproyectar).
- **Validación (test):** `replay(histórico) == historian v1` sobre los mismos datos (paridad).
- Idempotente: reproyectar N veces da el mismo resultado.

## 4. Alerting Engine (la pieza que faltaba) — ADR-13

Convierte ZooDash de *dashboard* en *centro operativo*: no solo observa, **advierte**. Reusa
el Apprise de v1 (`surfacing/notify.py`), que ya está montado.

**Reglas (configurables, `alert_rule`):**

| Regla | Disparo (default) |
|---|---|
| PR aging | PR abierto > 14 días |
| CI roja persistente | ≥ 3 ejecuciones fallidas seguidas (o roja > `CI_RED_ALERT_DAYS`) |
| Review pendiente | esperando review > 72 h |
| Conflicto viejo | conflicto > 7 días |
| Discord inactivo | sin actividad > 48 h |
| Bus factor | un autor supera el umbral de % de commits |

**Mecánica:** un evaluador (en el projector/historian) computa reglas → escribe `alert`
(open/resolved, **clave de dedupe + cooldown** para no spamear, igual que aprendimos en v1) →
notifica vía Apprise (una notificación-resumen) → UI muestra vista `/alerts` + badge en el header.
- **Anti-spam:** la alerta se emite una vez al **transicionar** a "activa" y se re-arma solo al
  resolverse (mismo principio por el que el cron del historian corre **sin** `--notify`).
- **Tablas:** `alert_rule`, `alert` (ver DATA_MODEL_v2 §Alerting).

## 5. Read models materializados — ADR-12

Las agregaciones de Contributor (p50/p90 cycle-time, Gini, latencias) son caras on-demand.
El projector mantiene tablas **materializadas** y la UI lee trivial:

- `contributor_summary(login, prs_opened, prs_merged, reviews, cycle_p50_h, cycle_p90_h,
  review_latency_h, waiting_hours_caused, last_active)` — refrescada por el projector ante
  eventos relevantes (o por `time_bucket` continuous aggregate en Timescale).
- `conflict_hotspot(path, times, last_seen)` — top archivos en conflicto.
- Fallback: si el read model no existe aún, calcular on-demand (degradación, no error).

Resultado: **UI instantánea**, SQL trivial, menos carga. (En Escalón 2/PG se pueden usar
*continuous aggregates* de Timescale para los rollups temporales.)

## 6. Contributor Analytics — métricas avanzadas (amplía FEATURES F-A)

Además de PRs/reviews/commits/cycle-time/Gini ya previstos:

- **Ownership Concentration / Bus Factor.** % de commits por autor; **bus factor** = nº mínimo
  de personas cuya cuota acumulada alcanza el 50%. Bajo bus factor → **alerta** (riesgo de
  dependencia de una persona). *Datos:* `commit.author_login` (ya en el esquema).
- **Review Bottleneck Score** = horas de espera **provocadas** por un reviewer = Σ sobre PRs
  con review solicitada a esa persona de `(submitted_at|now − requested_at)`. Mucho más
  operativo que "nº de reviews". *Datos:* `pr_reviewer.requested_at`, `code_review.submitted_at`.
- **Knowledge Distribution (mapa archivos↔personas).** Quién ha tocado qué parte del repo
  (para onboarding y bus factor por zona). *Datos:* archivos por PR/commit (GraphQL/REST
  `files`) → tabla puente `file_touch(path, login, commits, last_at)`. *Nota de coste:* requiere
  ingesta a nivel de archivo; marcar como sub-fase opcional.
- **Latencias extra:** **Merge Latency** (`merged_at − approved_at`), **CI Recovery Time**
  (`ci_green − ci_red`). Derivables de eventos/`pr_event`.

## 7. System Health / Observabilidad operativa — ADR-17

Panel + endpoint que vigilan **al propio ZooDash** (crítico cuando crece). Extiende el
`/api/health` que ya existe en v1.

```text
System Health
  GitHub poll:    hace 12s          freshness global: OK
  Webhook:        hace 4s           SSE clients: 2
  Projector lag:  0 eventos         NATS backlog: 0
  Redis pub/sub:  OK                último error: —
```

- `GET /api/system-health` → `{ pollAgeS, webhookAgeS, projectorLagEvents, sseClients,
  natsBacklog, redisOk, freshness }`. Lo que no aplique al escalón actual se omite.
- UI: tarjeta en `/` o vista `/system` + dot de salud en el header (reusa el patrón de v1).

## 8. Discord Panel — Health Score y correlación (amplía FEATURES F-D)

- **Discord Health Score (0–100)**: combinación ponderada de *usuarios activos*, *canales
  activos*, *recencia del último mensaje* y *ratio preguntas/respuestas*. Evita que el panel
  sea ruido: da una cifra operativa única.
- **Correlación GitHub↔Discord** (futuro, requiere `contributor.discord_id`): patrón
  `PR abierto → discusión en Discord → review → merge`, para revelar dinámica organizacional.
  Marcado como evolución, no v2 inicial.

## 9. Tiempo real — Event Coalescing (amplía ARCHITECTURE §5) — ADR-15

Si llegan 200 eventos en pocos segundos, **no** queremos 200 invalidaciones/refetch. El canal
SSE (y/o el cliente `useRealtime`) **coalescen** por ventana:

- Ventana de **500–1000 ms**; se acumulan `changed {entity, ids}` y se emite **una**
  invalidación agregada por entidad por ventana → 1 refetch, no N.
- Implementable client-side (debounce en `useRealtime`) y/o server-side (el publisher agrupa).
- Reduce renders y carga; mantiene la sensación de tiempo real (<1s de coalescencia).

## 10. Conflict Tracker — dos fases + nuevas vistas (amplía FEATURES F-C)

- **Fase A (V2.f, barata):** solo `mergeable=CONFLICTING` en el tiempo → PR en conflicto,
  antigüedad, tendencia. **Sin** clones/mirrors/merge-tree. Costo casi nulo.
- **Fase B (V2.i, cara):** `git merge-tree` en clon read-only → archivos en conflicto →
  **Conflict Heat Graph** (mapa de zonas: `src/runtime/* ██████`, `src/ui/* ███`) y
  **Conflict Age Risk** = `edad_días × nº_archivos × commits_nuevos` (normalizado) para
  **priorizar** qué conflicto atacar primero.
- **Predictive Conflict (v3):** detectar **alta probabilidad** de conflicto por *solapamiento
  de archivos modificados* entre ramas **antes** de que GitHub marque CONFLICTING.

## 11. Versionado de eventos — ADR-10

Todo evento lleva `schema_version` (entero). El projector aplica **upcasting** (transforma
v(n)→v(n+1) en memoria) para tolerar nuevos campos GraphQL, nuevos tipos GitHub, cambios de
Discord y nuevas métricas sin romper. Sin versionado, el projector se vuelve frágil. (Aplica
desde el primer evento que se emita, Escalón 3+.)

## 12. Simulación de caos (Simulador 5) — amplía TESTING

Donde se rompen los sistemas event-driven. Inyecta fallos y valida invariantes:

| Inyección | Invariante a validar |
|---|---|
| Webhook **duplicado** | idempotencia (event_id UNIQUE + upsert → 0 duplicados) |
| Webhook **fuera de orden** | el projector reconcilia por `ts` (no aplica un estado viejo sobre uno nuevo) |
| Webhook **perdido** | el reconciler (poll) cierra el hueco ≤ ventana de poll |
| **NATS caído** | el receiver bufferiza/reintenta; al volver, no se pierde ni duplica |
| **Redis caído** | SSE degrada (cliente cae a `refetchInterval`); no se cae la app |
| **Postgres lento** | backpressure; el lag del projector se observa en System Health |

**Aceptación:** tras el caos, las proyecciones convergen al estado correcto (eventual
consistency) y `git`/`.context_sync/` siguen intactos.

## 13. ADRs nuevas (10–17)

| ADR | Decisión |
|---|---|
| 10 | **Versionado de eventos** (`schema_version` + upcasting en el projector) |
| 11 | **Plano de datos por fases** — features sobre SQLite primero; PG cuando series/escala; JetStream/Event Store solo en Escalón 4 (multi-consumidor/replay/audit). *Supersede el "Event Store día 1".* |
| 12 | **Read models materializados** (`contributor_summary`, `conflict_hotspot`) mantenidos por el projector |
| 13 | **Alerting Engine** de primera clase (reglas → `alert` → Apprise; dedupe+cooldown) |
| 14 | **Replay Engine** de primera clase (CLI `zoodash replay`) |
| 15 | **Event Coalescing** en SSE (ventana 500–1000 ms) |
| 16 | **Conflict Tracker en dos fases** (status-only → merge-tree) |
| 17 | **System Health** (endpoint + panel; extiende `/api/health` de v1) |

## 14. Matriz revisada (valor × riesgo × complejidad) y orden final

| Orden | Feature | Valor | Riesgo | Complejidad |
|---|---|---|---|---|
| 1 | Command Palette | Muy alto | Muy bajo | Baja |
| 2 | Contributor Analytics (+ avanzadas) | Muy alto | Medio | Media |
| 3 | Discord Panel (+ Health) | Alto | Bajo | Baja |
| 4 | Postgres + read models + System Health | Habilitador | Medio | Media |
| 5 | Tiempo real (webhook→PG→SSE) + coalescing | Alto | Medio | Media |
| 6 | Conflict Tracker — Fase A | Medio | Bajo | Baja |
| 7 | Alerting Engine | Muy alto | Bajo | Baja-Media |
| 8 | Event Store + JetStream + Replay | Muy alto | Alto | Alta |
| 9 | Conflict Tracker — Fase B (merge-tree) | Alto | Alto | Alta |

> **~70–80% del valor visible con <30% de la complejidad operativa** entregando 1–3 (y 7) sobre
> el plano actual, y dejando 8–9 (infra pesada) para cuando aporte ventaja medible.
