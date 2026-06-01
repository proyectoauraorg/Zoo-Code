# ZooDash v2 — Arquitectura (tiempo real, event-sourced)

> Plano técnico. No implementado. Complementa [README.md](./README.md) y
> [DATA_MODEL_v2.sql](./DATA_MODEL_v2.sql).
>
> **Revisión v0.2 — leer junto a [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md):** esta
> arquitectura event-sourced **completa** es el **Escalón 4 (objetivo)**, no el punto de
> partida. Por decisión de fases (ADR-11), el tiempo real inicial es
> `webhook(gh forward) → Postgres → Redis pub/sub → SSE` **sin** NATS/Event Store; JetStream
> + event store se introducen solo cuando aparezcan multi-consumidor, replay masivo o audit.

## 1. Principios

1. **Event-sourcing con proyecciones.** La verdad es el **log de eventos** (append-only,
   auditable). El "estado actual" y las "métricas" son **proyecciones** derivadas, siempre
   reconstruibles re-proyectando el log.
2. **Push primero, pull de respaldo.** Webhooks dan latencia <30s; el poll del runtime (v1)
   se mantiene para **reconciliación** y **backfill** (si se cae el push, no perdemos estado).
3. **Idempotencia en todas partes.** Cada evento trae una clave única; reprocesar no duplica
   (igual filosofía que el historian v1).
4. **El frontend de v1 se reusa.** Solo cambia el origen de datos (interfaz repository) y se
   añade un canal de tiempo real (SSE). Las vistas nuevas se suman.
5. **Aislamiento de infra.** Compose propio de ZooDash; no se mezcla con la malla de ZordonOS.

## 2. Componentes

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│  INGESTA                                                                             │
│                                                                                      │
│  GitHub repo events ──webhook──▶  [receiver]  ──validar firma──▶  publish NATS       │
│  (pull_request, _review,          (Next route   (HMAC sha256)     subject:           │
│   check_run, push, issues,         o microsvc)                    zoodash.gh.<type>  │
│   issue_comment)                                                                     │
│        ▲                                                                             │
│        │  gh webhook forward  (CLI; reenvía a localhost, sin endpoint público)       │
│                                                                                      │
│  Context-Sync Runtime (v1, sigue) ── snapshots github.json ──▶ [reconciler] ─▶ NATS  │
│                                       (poll cada N min; backfill + corrección)       │
│                                                                                      │
│  GitHub GraphQL v4 (gh api graphql) ── reviewers/commits/reviews/labels ─▶ [enricher]│
└──────────────────────────────────────────────┬───────────────────────────────────────┘
                                                │ NATS JetStream (stream ZOODASH, durable)
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│  PROCESAMIENTO                                                                       │
│  [projector] (consumer durable, idempotente)                                         │
│    1. append a  event_log (event store)                                              │
│    2. upsert proyecciones:  pr, issue, contributor, code_review, commit, conflict... │
│    3. insert métricas a hypertables Timescale (repo_metric, contributor_metric...)   │
│    4. invalida/escribe Redis (cache de proyecciones calientes)                       │
│    5. publica Redis pub/sub  channel "zoodash:changed"  {entity, ids}                │
└──────────────────────────────────────────────┬───────────────────────────────────────┘
        Postgres + TimescaleDB  ◀───────────────┤        Redis (cache + pub/sub) ◀──────┘
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│  SERVICIO (Next.js, mismo repo)                                                      │
│  /api/*            lee proyecciones (vía repository → driver postgres)               │
│  /api/stream (SSE) suscrito a Redis pub/sub → empuja "changed" al navegador          │
│  UI v1 (misma) + /contributors /discord /conflicts + Command Palette                 │
│   TanStack Query: al recibir "changed", invalida la(s) queryKey afectada(s)          │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Servicios (compose propio)
- **postgres** (con extensión TimescaleDB) — proyecciones + hypertables + event store.
- **redis** — cache de lecturas calientes + canal pub/sub para SSE.
- **nats** (JetStream) — bus de eventos durable. *Instancia propia de ZooDash* (puerto/red
  separados de la de ZordonOS).
- **projector** — proceso Node o Python que consume NATS y escribe PG/Redis.
- **receiver / enricher / reconciler** — pueden vivir como Route Handlers de Next (Node) o
  como pequeños procesos; se decide en V2.1 (ver ADR-9).

## 3. Subjects NATS y contrato de evento

`subject = zoodash.gh.<type>` con `type ∈ {pr, review, ci, push, issue, comment, discord}`.

Envelope canónico (JSON) — **idempotencia por `event_id`**:

```jsonc
{
  "schema_version": 1,              // versionado (ADR-10): el projector hace upcasting v(n)→v(n+1)
  "event_id": "gh:pull_request:388:synchronize:2026-05-29T19:09:42Z", // único, determinista
  "ts": "2026-05-29T19:09:42Z",     // cuándo ocurrió (de GitHub)
  "source": "webhook|graphql|reconciler",
  "type": "pr",
  "action": "opened|synchronize|closed|merged|review_submitted|ci_completed|...",
  "repo": "Zoo-Code-Org/Zoo-Code",
  "entity": { "kind": "pr", "number": 388 },
  "payload": { /* normalizado: state, reviewDecision, mergeable, ci{...}, author, ... */ },
  "raw_digest": "sha256(...)" // huella del payload original para auditar
}
```

El **projector** computa transiciones (reusa la lógica de `pr_event` de v1) y deriva métricas.
`event_id` determinista permite que webhook y reconciler produzcan el **mismo** evento sin
duplicar (el event store tiene `UNIQUE(event_id)`).

## 4. Tiempo real: presupuesto de latencia (<30s)

| Tramo | Objetivo | Notas |
|---|---|---|
| GitHub → webhook recibido | 1–5 s | depende de GitHub; `gh webhook forward` añade ~ms |
| receiver → NATS publish | <50 ms | validar firma + publish |
| NATS → projector consume | <100 ms | JetStream push, consumer durable |
| projector → PG upsert + Redis pub | 50–300 ms | transacción + publish |
| Redis pub → SSE → navegador | <200 ms | conexión SSE viva |
| invalidación TanStack → refetch `/api/*` | 100–400 ms | una query puntual |
| **Total típico** | **~2–7 s** | holgado bajo el objetivo de 30 s |

Si el webhook falla (sin push), el **reconciler** (poll cada 60–120 s) cubre el peor caso
≤ ~2 min, aún aceptable como degradación.

## 5. SSE — contrato del canal

`GET /api/stream` (Route Handler Node, `runtime="nodejs"`, `dynamic="force-dynamic"`):
- Devuelve `text/event-stream` con un `ReadableStream`; se suscribe a Redis `zoodash:changed`.
- Cada mensaje: `event: changed\ndata: {"entity":"pr","ids":[388]}\n\n`.
- Heartbeat `:\n\n` cada 15 s para mantener viva la conexión y detectar cortes.
- Cliente: un `EventSource` (hook `useRealtime()`) traduce `changed` → `queryClient.invalidateQueries({queryKey:[entity]})`. **No** re-renderiza todo; refetch puntual.
- Fallback: si `EventSource` falla/!soportado, TanStack sigue con `refetchInterval` (v1).

## 6. Acceso a datos — interfaz repository (clave de la migración)

```ts
// src/lib/repo/types.ts  (v2)
export interface MetricRepo {
  getMetricSeries(days: number): Promise<MetricPoint[]>;
  getMergedThisWeek(): Promise<number>;
  // ...
}
export interface PrRepo { /* getPrs, getColumnEntryTimes, ... */ }
export interface ContributorRepo { /* getContributors, getReviewLoad, cycleTime... */ }
// drivers:
//   src/lib/repo/sqlite/*   (v1, síncrono envuelto en async)  → dev/offline
//   src/lib/repo/postgres/* (v2, pg + sql)                    → producción v2
export function makeRepos(): { metric: MetricRepo; pr: PrRepo; /* ... */ } {
  return process.env.DB_DRIVER === "postgres" ? postgresRepos() : sqliteRepos();
}
```

Las rutas `/api/*` actuales pasan a usar `makeRepos()`. **El frontend no cambia** (mismos
JSON tipados). `DB_DRIVER` (env) selecciona el motor → cutover por flag.

## 7. Migración v1 → v2 (strangler-fig, sin downtime ni estados rotos)

1. **V2.0**: levantar compose; crear esquema PG (DATA_MODEL_v2.sql). Implementar driver
   `postgres` detrás del repository. **Backfill**: re-proyectar el histórico de SQLite
   (`poll/pr_snapshot/...`) → PG (script de migración idempotente).
2. **Dual-write/validación**: el historian/projector escribe a ambos (SQLite y PG) un tiempo;
   un test compara que las lecturas coinciden (paridad de datos).
3. **Cutover**: cambiar `DB_DRIVER=postgres` por feature flag. SQLite queda como driver de
   dev/offline y como respaldo.
4. **V2.1+**: añadir push (webhooks/SSE) y vistas nuevas sobre el motor PG.

Rollback: `DB_DRIVER=sqlite` revierte el plano de datos al instante; las vistas nuevas se
ocultan con flags (`FEATURE_CONTRIBUTORS`, etc.). `main` siempre desplegable.

## 8. ADRs (detalle)

- **ADR-1 — SSE vs WebSocket.** El flujo es servidor→cliente (notificar cambios). SSE: nativo
  en el browser (`EventSource`), reconecta solo, vive en un Route Handler con `ReadableStream`,
  sin servidor aparte. WebSocket añadiría bidireccionalidad que no necesitamos. **→ SSE.**
- **ADR-2 — Bus de eventos.** Kafka es sobredimensionado; Redis Streams obligaría a otra
  semántica; **NATS JetStream ya está en ZordonOS** y encaja con `event_fabric`. Usamos una
  **instancia/credenciales propias** de ZooDash (no la malla de ZordonOS). **→ NATS JetStream.**
- **ADR-3 — Ingesta de webhooks sin endpoint público.** Exponer un puerto a internet rompe la
  gobernanza y el aislamiento. **`gh webhook forward --repo Zoo-Code-Org/Zoo-Code --events ...
  --url http://localhost:PORT/api/webhook`** reenvía a localhost autenticado por la sesión `gh`.
  **→ forward local.** (Alternativa documentada: `smee.io` si se quisiera multi-máquina.)
- **ADR-4 — Postgres+TimescaleDB, SQLite sobrevive.** Hypertables + funciones de tiempo
  (`time_bucket`, `first/last`) hacen trivial el aging/series; compresión/retención por política.
  SQLite se mantiene como driver de dev/offline. **→ dual-driver.**
- **ADR-5 — Event-sourcing.** Event store auditable + proyecciones idempotentes = reconciliable
  con el poll, reproducible, y permite *time-travel* (re-proyectar). **→ sí.**
- **ADR-6 — Conflictos por archivo.** GitHub no expone fácilmente los archivos en conflicto.
  `git merge-tree <base> <head>` los calcula localmente. Se hace sobre un **clon read-only
  dedicado** (`~/.cache/zoodash/repo.git`, mirror), **nunca** sobre `Zoo-Code-contrib`. **→ merge-tree en clon aparte.**
- **ADR-7 — Command Palette.** `cmdk` (headless, accesible, usado por Linear/Vercel). Integra
  con tokens v1 y `cn()`. **→ cmdk.**
- **ADR-8 — Repository interface.** Desacopla rutas del motor; habilita strangler-fig y tests
  con driver in-memory. **→ sí.**
- **ADR-9 — ¿Procesos o Route Handlers?** receiver/projector pueden ser Route Handlers (Node)
  para simplicidad de un solo proceso, **excepto el projector**, que conviene como proceso
  durable (consumidor NATS de larga vida) fuera del ciclo de request de Next. **→ projector =
  proceso (Node/Python) en compose; receiver = Route Handler.**

## 9. Seguridad / operación
- Validación HMAC del webhook (`X-Hub-Signature-256`) con secreto en `.env.local` (no commit).
- Secretos en `.env.local` / variables de entorno; nunca en el repo.
- NATS con auth (token/nkey) y stream dedicado `ZOODASH`.
- PG con rol de solo-lectura para las rutas de lectura; rol de escritura solo para el projector.
- Observabilidad: el projector expone lag del consumer y contadores; log estructurado.
