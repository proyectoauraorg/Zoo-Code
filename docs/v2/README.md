# ZooDash v2 — Dossier de preparación (NO implementar aún)

> **Estado:** diseño/preparación. Nada de esto está construido. Es el plano técnico
> completo de v2 para ejecutarlo cuando se apruebe. Hereda la identidad y el contrato
> visual de v1 (ver [../ui-ux/STANDARDS.md](../ui-ux/STANDARDS.md)) y la verdad-terreno de
> [zControlPlane/CONTEXT.md](/Users/dr.armandovaquera/zSys/zControlPlane/CONTEXT.md).
>
> **➡ v0.2 — empieza por [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md):** integra tres
> revisiones externas y **supersede el orden de fases de §3** (features sobre SQLite primero;
> Postgres/JetStream/Event Store **diferidos** hasta que aporten ventaja medible). Añade
> Alerting Engine, Replay Engine, read models materializados, System Health, Event Coalescing,
> versionado de eventos y métricas avanzadas de Contributor.

## Índice

| Doc | Qué contiene |
|---|---|
| **README.md** (este) | Resumen no-técnico y técnico, alcance, fases, matriz, decisiones (ADRs) |
| **[ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md)** | **v0.2 (autoritativo)** — roadmap revisado + addenda: Alerting, Replay Engine, read models, System Health, Event Coalescing, métricas avanzadas, Conflict 2 fases, chaos sim, ADRs 10–17 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitectura tiempo-real event-sourced, flujo de datos, migración v1→v2, ADRs |
| [DATA_MODEL_v2.sql](./DATA_MODEL_v2.sql) | Esquema PostgreSQL + TimescaleDB (contributors, reviews, commits, discord, conflicts, event store) |
| [FEATURES.md](./FEATURES.md) | Fichas: Contributor Analytics · Discord Panel · Merge Conflict Tracker · Command Palette |
| [TESTING_AND_SIMULATION.md](./TESTING_AND_SIMULATION.md) | Pirámide de pruebas + arnés de **simulación** (generadores sintéticos, replay, load test de latencia) |
| [compose.v2.example.yml](./compose.v2.example.yml) | Infra local de v2 (Postgres/Timescale, Redis, NATS) — plantilla |

---

## 1. Para no-técnicos (en una página)

**Qué es v1 hoy:** un tablero que, cada cierto rato, lee una "foto" del estado de GitHub
(la que ya genera el runtime) y la muestra: PRs, issues, CI, drift. Las novedades aparecen
con minutos de retraso (cuando se vuelve a tomar la foto) y solo sabemos *cuánto* hay, no
*quién* ni *por qué*.

**Qué añade v2 (4 cosas + 1 cambio de motor):**

1. **Contributor Analytics** — *"¿quién está moviendo el proyecto y dónde se atasca?"*
   Quién abre/mergea PRs, quién revisa, cuánto tarda un PR de abierto a mergeado
   (cycle-time), y si la carga de revisión está desbalanceada.
2. **Discord Panel** — *"¿qué se está hablando en la comunidad?"* Actividad de Discord
   (quién, en qué canal, cuánto), usando los datos que el runtime ya recoge (sin espiar).
3. **Merge Conflict Tracker** — *"¿qué PRs chocan y con qué archivos, y desde cuándo?"*
   Detecta conflictos, cuánto llevan sin resolverse y qué archivos son "zonas calientes".
4. **Command Palette (Cmd-K)** — *"saltar a cualquier PR/issue/persona o ejecutar una acción
   tecleando"*, estilo Linear/Raycast. Velocidad de operador.
5. **Tiempo real (<30s)** — en vez de esperar a la próxima "foto", v2 **reacciona a eventos**
   de GitHub casi al instante: cuando algo cambia, el tablero se actualiza solo en segundos.

**Por qué cambia el "motor":** mostrar tendencias ricas y reaccionar en segundos no escala
con una "foto + base de datos de archivo". v2 usa un **bus de eventos** (algo ya montado en
tu entorno, NATS) + una base de datos pensada para series temporales (PostgreSQL +
TimescaleDB) + una caché (Redis). Es la misma cocina que ya tienes para ZordonOS; v2 abre su
**propia** instancia para no tocar esa malla.

**Riesgo y costo:** más piezas móviles (3 servicios nuevos en local). Por eso v2 va **por
fases**, cada una desplegable y reversible, y **el frontend de v1 se reusa** (solo cambia de
dónde lee). Lo validamos con **simulación** (eventos falsos a alta velocidad) **antes** de
conectar nada real.

---

## 2. Para técnicos (resumen ejecutivo)

v2 pasa de **pull + snapshot-historización** (v1: `gh` → `github.json` → SQLite append) a
**push + event-sourcing con proyecciones** manteniendo el pull como *fallback/reconciliación*:

```
GitHub ──(webhooks)──▶ receiver ──▶ NATS JetStream ──▶ projector ──▶ Postgres/TimescaleDB
   │                  (gh webhook        (stream            │            (+ Redis cache)
   │                   forward, local)    zoodash.*)        ├─▶ event store (auditable)
   └──(gh CLI poll, runtime actual)───────────────────────▶┘   reconciliación / backfill
                                                                       │
                                            Next Route Handlers ◀──────┤
                                              /api/* (lee proyecciones)│
                                              /api/stream (SSE) ◀── Redis pub/sub ── projector
                                                     │
                                              UI v1 (misma) + vistas nuevas + Cmd-K
```

- **Ingesta tiempo real local-friendly:** `gh webhook forward` (GitHub CLI) reenvía webhooks
  del repo a un receiver en `localhost` — **sin** exponer un endpoint público (respeta la
  gobernanza y el aire-comprimido del entorno). El receiver valida la firma y publica a NATS.
- **Event store + proyecciones:** los eventos crudos se guardan (auditable, reproducible);
  un *projector* idempotente los proyecta a tablas de estado actual y a **hypertables**
  Timescale para métricas. Esto reusa el patrón `event_fabric` de ZordonOS.
- **Real-time al cliente:** `GET /api/stream` (SSE, `ReadableStream` en un Route Handler Node)
  suscrito a Redis pub/sub; el projector publica "lo que cambió" y el cliente **invalida**
  selectivamente las queries de TanStack Query → refetch puntual. SSE > WebSocket aquí
  (unidireccional, simple, sin server aparte).
- **Datos enriquecidos:** GitHub **GraphQL v4** (`gh api graphql`) para reviewers, reviews,
  commits por PR, labels en PRs y cycle-time — lo que el snapshot REST no trae.
- **Conflictos a nivel archivo:** `git merge-tree` sobre un **clon read-only aparte** (NO el
  fork de trabajo) para detectar archivos en conflicto sin mutar nada.
- **Compatibilidad:** el frontend de v1 se mantiene; el backend abstrae el acceso a datos tras
  una interfaz (repository) con dos drivers: `sqlite` (v1/offline) y `postgres` (v2). Migración
  *strangler-fig*: dual-run + dual-write + cutover por feature flag.

---

## 3. Alcance v2 y fases

> **Nota v0.2:** el orden de fases de esta tabla está **superseded** por
> [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md) §2 ("plano de datos por fases":
> features sobre SQLite primero, infra pesada diferida). Se conserva abajo como referencia
> del **alcance funcional** (qué entrega cada bloque), no del orden.

| Fase | Entrega | Depende de |
|---|---|---|
| **V2.0 — Infra & motor** | compose (PG/Timescale/Redis/NATS), interfaz repository + driver Postgres, event store, projector, migración de `repo_metric` a hypertable, **simulación** verde | — |
| **V2.1 — Tiempo real** | receiver de webhooks (`gh webhook forward`), publish→NATS, projector→Redis pub/sub, `/api/stream` SSE, cliente reacciona <30s | V2.0 |
| **V2.2 — Contributor Analytics** | ingesta GraphQL (reviewers/commits/reviews), tablas + métricas, vista `/contributors` | V2.0 (V2.1 opcional) |
| **V2.3 — Merge Conflict Tracker** | detección de conflictos + `git merge-tree`, vista `/conflicts` | V2.0 |
| **V2.4 — Discord Panel** | historización de `discord.json` (tabla ya prevista), vista `/discord` | V2.0 |
| **V2.5 — Command Palette** | `cmdk`, `/api/search`, navegación + acciones | ninguna dura (puede ir antes; es client-side) |
| **V2.6 — Narrativa (opcional)** | resúmenes con `cognition` + LiteLLM (texto, no números) | V2.2–2.4 |

> **Command Palette** es independiente y de bajo riesgo: podría adelantarse como v1.x si se
> quiere valor inmediato sin esperar al motor de v2.

## 4. Matriz valor × esfuerzo

```text
                 ESFUERZO BAJO                 │  ESFUERZO ALTO
   ┌──────────────────────────────────────────┼───────────────────────────────────────┐
 V │  ★ Command Palette (Cmd-K)                 │  ★ Tiempo real (V2.1)                  │
 A │  ★ Discord Panel (datos ya existen)        │     Contributor Analytics (V2.2)        │
 L ├──────────────────────────────────────────┼───────────────────────────────────────┤
 O │  Conflict Tracker básico                   │  Infra & motor (V2.0)                   │
 R │  (solo CONFLICTING en el tiempo)           │  Conflict a nivel archivo (merge-tree)  │
   └──────────────────────────────────────────┴───────────────────────────────────────┘
```

Orden sugerido: **V2.5 (palette)** y **V2.4 (discord)** dan valor rápido; **V2.0→V2.1**
es la inversión de motor que habilita el resto; **V2.2/V2.3** explotan ese motor.

## 5. Decisiones de arquitectura (ADRs, resumen — detalle en ARCHITECTURE.md)

| ADR | Decisión | Por qué |
|---|---|---|
| 1 | **SSE** (no WebSocket) para el push al cliente | unidireccional, simple, funciona en Route Handler |
| 2 | **NATS JetStream** (no Kafka/Redis Streams) como bus | ya está en ZordonOS; reusar patrón `event_fabric` |
| 3 | **`gh webhook forward`** (no túnel público) | tiempo real local sin exponer endpoint; respeta gobernanza |
| 4 | **Postgres+TimescaleDB**; SQLite sobrevive como driver | hypertables para series; dev/offline sigue en SQLite |
| 5 | **Event-sourcing** (event store + proyecciones idempotentes) | auditable, reproducible, reconciliable con el poll |
| 6 | Conflictos por archivo con **`git merge-tree`** en clon aparte | sin tocar el fork de trabajo (gobernanza) |
| 7 | **`cmdk`** para la paleta | estándar de facto (Linear/Vercel), accesible, ligero |
| 8 | **Repository interface** con drivers `sqlite`/`postgres` | migración strangler-fig sin reescribir el frontend |

## 6. Gobernanza heredada (innegociable, también en v2)

- Solo **lectura** sobre `Zoo-Code-Org/Zoo-Code`; **no** abrir PRs/issues en upstream.
- **No** tocar el fork `Zoo-Code-contrib`; el clon para `merge-tree` es **otro** directorio read-only.
- Discord = del runtime (`.context_inbox/discord.txt`), **nunca** scraping.
- Webhooks **sin** endpoint público (forward local).
- Compose **propio** de ZooDash; **no** mezclar con la malla de ZordonOS.
- Commits sin trailer de IA (autor Armando Vaquera); respuestas en español, código en inglés.
