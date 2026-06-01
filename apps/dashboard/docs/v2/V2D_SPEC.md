# ZooDash V2.d — Spec técnica: Repository Pattern + Postgres + Read Models + System Health

> **Estado:** Diseño — no implementado.
> **Autoridad:** Este documento es la spec de implementación de V2.d. Complementa
> [ARCHITECTURE.md](./ARCHITECTURE.md) §6 (interfaz repository) y
> [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md) §2/§5/§7.
>
> **ADR aplicados:** ADR-8 (Repository), ADR-11 (plano de datos por fases),
> ADR-12 (read models), ADR-17 (System Health).

---

## 1. Objetivo

Migrar ZooDash de SQLite a **PostgreSQL** como plano de datos principal, introduciendo:

1. **Repository Pattern** — desacoplar rutas del motor de persistencia.
2. **Read Models materializados** — `contributor_summary`, `conflict_hotspot`.
3. **System Health** — endpoint + panel que vigila al propio ZooDash.
4. **Instrumentación** — métricas internas de latencia.

**Todo esto sin cambiar UI ni contratos de API existentes.**

---

## 2. Sub-fases (orden revisado)

| Sub-fase | Contenido | Riesgo | Valor |
|----------|-----------|--------|-------|
| V2.d.1 | Repository Pattern + driver Postgres | Medio | Habilitador |
| V2.d.4 | Instrumentación interna | Bajo | Medio |
| V2.d.3 | System Health (endpoint + panel) | Bajo | Alto |
| V2.d.2 | Read Models materializados | Bajo | Alto |

> **Orden revisado:** V2.d.4 (instrumentación) se adelanta a V2.d.3 (System Health)
> para que `/system` nazca ya alimentado por métricas reales. V2.d.2 (Read Models)
> va al final porque depende de que el Repository y la instrumentación estén en sitio.

---

## 3. V2.d.1 — Repository Pattern

### 3.1 Problema actual

Las 14 funciones de [`queries.ts`](src/lib/queries.ts) llaman a `getDb()` directamente.
Las API routes importan `readGithubSnapshot()` de [`snapshots.ts`](src/lib/snapshots.ts).
No hay abstracción intercambiable.

### 3.2 Diseño propuesto

```
src/lib/repo/
  types.ts          ← interfaces (contratos)
  sqlite/
    index.ts        ← implementación SQLite (actual, envuelta en async)
    snapshot.ts     ← lectura de snapshots (actual snapshots.ts)
  postgres/
    index.ts        ← implementación Postgres (nueva)
    snapshot.ts     ← lectura de snapshots (desde PG)
  index.ts          ← factory: makeRepos() según DB_DRIVER
```

### 3.3 Interfaces (contratos)

```typescript
// src/lib/repo/types.ts

// ── Contexto de request (observabilidad) ──
export interface RepoContext {
  requestId: string;   // UUID, para correlación
  now: Date;           // timestamp del request, inyectado
}
// makeRepos(ctx) permite que V2.e/V2.h inyecten trace/correlation IDs.

// ── Métricas del repo ──
export interface MetricRepo {
  getMetricSeries(days: number, ctx?: RepoContext): Promise<MetricPoint[]>;
  getMergedThisWeek(ctx?: RepoContext): Promise<number>;
}

// ── PRs ──
export interface PrRepo {
  getColumnEntryTimes(ctx?: RepoContext): Promise<Map<number, string>>;
}

// ── Eventos / Feed ──
export interface EventRepo {
  getRecentEvents(limit: number, ctx?: RepoContext): Promise<PrEvent[]>;
}

// ── Contributors ──
export interface ContributorRepo {
  getContributors(ctx?: RepoContext): Promise<ContributorRow[]>;
  getOpenPrsByAuthor(ctx?: RepoContext): Promise<Map<string, OpenPrStats>>;
  getCycleTimes(ctx?: RepoContext): Promise<CycleTimeRow[]>;
  getBusFactor(ctx?: RepoContext): Promise<BusFactorResult>;
}

// ── Discord ──
export interface DiscordRepo {
  getByChannel(limit: number, ctx?: RepoContext): Promise<DiscordChannelRow[]>;
  getByUser(limit: number, ctx?: RepoContext): Promise<DiscordUserRow[]>;
  getSeries(days: number, ctx?: RepoContext): Promise<DiscordSeriesRow[]>;
  getLastActivity(ctx?: RepoContext): Promise<string | null>;
  getTotal(ctx?: RepoContext): Promise<number>;
}

// ── Snapshots (estado actual) ──
export interface SnapshotRepo {
  readGithub(ctx?: RepoContext): Promise<GithubSnapshot | null>;
  readState(ctx?: RepoContext): Promise<StateSnapshot | null>;
  readGithubHealth(ctx?: RepoContext): Promise<{ ok: boolean; fetchedAt: string | null } | null>;
  readDiscord(ctx?: RepoContext): Promise<DiscordSnapshot | null>;
  search(q: string, limit: number, ctx?: RepoContext): Promise<SearchResponse>;
}

// ── System Health (descompuesto para escalabilidad) ──
export interface HealthRepo {
  getDbHealth(ctx?: RepoContext): Promise<DbHealth>;
  getSnapshotHealth(ctx?: RepoContext): Promise<SnapshotHealth>;
  getHistorianHealth(ctx?: RepoContext): Promise<HistorianHealth>;
  getApiHealth(ctx?: RepoContext): Promise<ApiHealth>;
  getResourceHealth(ctx?: RepoContext): Promise<ResourceHealth>;
  getSystemHealth(ctx?: RepoContext): Promise<SystemHealthData>;
  // getSystemHealth() compone los 5 anteriores.
}

// ── Factory ──
export interface Repos {
  metric: MetricRepo;
  pr: PrRepo;
  event: EventRepo;
  contributor: ContributorRepo;
  discord: DiscordRepo;
  snapshot: SnapshotRepo;
  health: HealthRepo;
}
```

### 3.4 Factory

```typescript
// src/lib/repo/index.ts
import { makeSqliteRepos } from "./sqlite";
import { makePostgresRepos } from "./postgres";
import type { Repos, RepoContext } from "./types";

export function makeRepos(ctx?: RepoContext): Repos {
  const driver = process.env.DB_DRIVER ?? "sqlite";
  if (driver === "postgres") return makePostgresRepos(ctx);
  return makeSqliteRepos(ctx);
}
```

> **RepoContext** (`requestId`, `now`) se inyecta opcionalmente. Permite que
> V2.e (tiempo real) y V2.h (Event Store) inyecten trace/correlation IDs
> sin cambiar los contratos de los repositorios.

### 3.5 Migración de rutas API

Cada ruta pasa de importar funciones directas a usar `makeRepos()`:

```typescript
// ANTES (actual):
import { getMergedThisWeek, getMetricSeries } from "@/lib/queries";
import { readGithubSnapshot } from "@/lib/snapshots";

export function GET() {
  const gh = readGithubSnapshot();
  const series = getMetricSeries(30);
  // ...
}

// DESPUÉS (V2.d.1):
import { makeRepos } from "@/lib/repo";

export async function GET() {
  const repos = makeRepos();
  const gh = await repos.snapshot.readGithub();
  const series = await repos.metric.getMetricSeries(30);
  // ...
}
```

**Cambio clave:** todas las funciones de repositorio son `async` (incluso la implementación SQLite, que envuelve las síncronas en `Promise.resolve()`). Esto permite que el driver Postgres sea nativamente async sin cambiar los contratos.

### 3.6 Driver SQLite (envoltura)

```typescript
// src/lib/repo/sqlite/index.ts
export function makeSqliteRepos(): Repos {
  return {
    metric: {
      async getMetricSeries(days) { return getMetricSeries(days); },
      async getMergedThisWeek() { return getMergedThisWeek(); },
    },
    pr: {
      async getColumnEntryTimes() { return getColumnEntryTimes(); },
    },
    // ... etc (envuelve cada función existente en Promise.resolve)
  };
}
```

### 3.7 Driver Postgres

```typescript
// src/lib/repo/postgres/index.ts
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000,       // 10s: mata queries colgadas
  application_name: "zoodash",    // visible en pg_stat_activity
});

export function makePostgresRepos(): Repos {
  return {
    metric: {
      async getMetricSeries(days) {
        const { rows } = await pool.query(
          `SELECT date_trunc('day', ts) AS d,
                  MAX(pr_open) AS pr_open,
                  MAX(pr_ci_failing) AS pr_ci_failing,
                  MAX(issues) AS issues
           FROM repo_metric
           WHERE ts >= now() - INTERVAL '${days} days'
           GROUP BY d ORDER BY d`,
        );
        return rows.map(/* mapeo */);
      },
      // ...
    },
    // ...
  };
}
```

> **`application_name: "zoodash"`** permite identificar ZooDash en
> `pg_stat_activity` cuando hay múltiples aplicaciones conectadas a la misma DB.
> **`statement_timeout: 10000`** mata queries que excedan 10s, evitando bloqueos.

### 3.8 Dependencia nueva

| Paquete | Versión | Rol |
|---------|---------|-----|
| `pg` | `^8` | Driver PostgreSQL para Node.js |
| `@types/pg` | `^8` | Tipos TypeScript |

### 3.9 Variables de entorno nuevas

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DB_DRIVER` | `sqlite` | `sqlite` o `postgres` |
| `DATABASE_URL` | — | Connection string de PostgreSQL |

---

## 4. V2.d.2 — Read Models materializados

> **Ownership explícito:** En V2.d, `historian.py` es el **propietario** de los
> read models. Tras cada poll, recalcula `contributor_summary` y `conflict_hotspot`.
> Cuando V2.h introduzca el Projector formal, éste **hereda** la propiedad.
> Esto evita dos fuentes de verdad.

### 4.1 Tablas nuevas (PostgreSQL)

```sql
-- contributor_summary: materializado por historian.py tras cada poll
CREATE TABLE contributor_summary (
    login                 TEXT PRIMARY KEY,
    prs_opened            INTEGER NOT NULL DEFAULT 0,
    prs_merged            INTEGER NOT NULL DEFAULT 0,
    reviews               INTEGER NOT NULL DEFAULT 0,
    commits               INTEGER NOT NULL DEFAULT 0,
    cycle_p50_h           DOUBLE PRECISION,
    cycle_p90_h           DOUBLE PRECISION,
    review_latency_h      DOUBLE PRECISION,
    waiting_hours_caused  DOUBLE PRECISION,
    commit_share_pct      DOUBLE PRECISION,
    last_active           TIMESTAMPTZ,
    refreshed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    schema_version        INTEGER NOT NULL DEFAULT 1    -- ADR-10: upcasting
);

-- conflict_hotspot: top archivos en conflicto
CREATE TABLE conflict_hotspot (
    path              TEXT PRIMARY KEY,
    times             INTEGER NOT NULL DEFAULT 0,
    last_seen         TIMESTAMPTZ,
    schema_version    INTEGER NOT NULL DEFAULT 1
);

-- system_snapshot: cache de health/KPIs/dashboard totals
CREATE TABLE system_snapshot (
    key             TEXT PRIMARY KEY,
    value           JSONB NOT NULL,
    refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    schema_version  INTEGER NOT NULL DEFAULT 1
);
```

> **`schema_version`** en cada read model permite evolucionar el esquema sin
> romper lecturas existentes. El projector/historian aplica upcasting v(n)→v(n+1).
>
> **`system_snapshot`** permite cachear health, overview, KPIs y dashboard totals
> sin recalcular en cada request.

### 4.2 Cuándo se refrescan

- **PostgreSQL:** `historian.py` recalcula los read models tras cada poll (dentro
  de la misma transacción que el INSERT de `repo_metric`/`pr_snapshot`).
- **SQLite (dev):** fallback a cálculo on-demand (como actualmente).

### 4.3 Consumidor

`ContributorRepo.getContributors()` lee de `contributor_summary` (PG) o calcula on-demand (SQLite).

---

## 5. V2.d.3 — System Health

### 5.1 Endpoint

```
GET /api/system-health
```

### 5.2 Respuesta

```typescript
interface DbHealth {
  driver: "sqlite" | "postgres";
  ok: boolean;
  sizeMb: number | null;
  queryLatencyMs: number | null;
}

interface SnapshotHealth {
  ageS: number | null;
  ok: boolean;
  githubOk: boolean;
  discordOk: boolean;
}

interface HistorianHealth {
  lastRunS: number | null;
  lagPolls: number;
  lastDurationMs: number | null;
}

interface ApiHealth {
  latencyMs: Record<string, number>;    // latencia promedio por endpoint
  requestsTotal: Record<string, number>; // total de requests por endpoint
  errorsTotal: Record<string, number>;   // total de errores por endpoint
  errorRate: Record<string, number>;     // errors/requests por endpoint
}

interface ResourceHealth {
  memoryMb: number;          // RSS del proceso Node.js
  heapUsedMb: number;        // heap usado
  heapTotalMb: number;       // heap total
  cpuPct: number | null;     // % CPU (si disponible)
  diskFreeMb: number | null; // espacio libre en disco (data/)
}

interface SystemHealthData {
  snapshot: SnapshotHealth;
  db: DbHealth;
  historian: HistorianHealth;
  api: ApiHealth;
  resources: ResourceHealth;
  freshness: "ok" | "stale" | "critical";
  uptimeS: number;
}
```

> **`ApiHealth`** incluye contadores `requestsTotal` y `errorsTotal` por endpoint,
> además de `errorRate`. Esto permite construir SLO, availability y alertas de
> error rate sin infraestructura adicional.
>
> **`ResourceHealth`** monitoriza RAM, heap, CPU y disco. Muchos fallos reales
> vienen de disco lleno o RAM agotada, no de la base de datos.

### 5.3 Panel UI

Nueva ruta `/system` con:
- Tarjetas KPI: snapshot age, DB health, historian lag, uptime, memoria, disco.
- Indicador de frescura (verde/amarillo/rojo).
- Tabla de latencias por endpoint con error rate.
- Alertas de recursos: disco <1GB, heap >80%, CPU >90%.

### 5.4 Badge en header

El dot de salud del header (`AppHeader.tsx`) pasa de leer `/api/health` a leer `/api/system-health`:
- `freshness === "ok"` → verde
- `freshness === "stale"` → amarillo
- `freshness === "critical"` → rojo

---

## 6. V2.d.4 — Instrumentación

### 6.1 Métricas a capturar

| Métrica | Dónde | Cómo |
|---------|-------|------|
| `historian_duration_ms` | `historian.py` | `time.time()` antes/después de `ingest()` |
| `snapshot_parse_ms` | `snapshots.ts` | wrapper con `performance.now()` |
| `api_latency_ms` | Route Handlers | middleware o wrapper |
| `db_query_ms` | repositorio | timer en cada query |
| `api_requests_total` | Route Handlers | contador por endpoint |
| `api_errors_total` | Route Handlers | contador de errores por endpoint |

### 6.2 Almacenamiento

- **SQLite:** tabla `internal_metric(ts, key, value)`.
- **PostgreSQL:** misma tabla o `system_metric` hypertable.

### 6.3 Consumidor

`HealthRepo.getApiHealth()` lee contadores para calcular `errorRate`.
`HealthRepo.getSystemHealth()` compone todas las métricas de salud.

---

## 7. Plan de migración SQLite → PostgreSQL

### 7.1 Estrategia: Strangler Fig

```
Fase 1: Dual-driver (ambos existen, flag selecciona)
  └── DB_DRIVER=sqlite (dev, default)
  └── DB_DRIVER=postgres (producción)

Fase 2: Backfill SQLite → Postgres
  └── Script que lee SQLite y escribe a PG (idempotente)

Fase 3: Validación de paridad
  └── Test que compara lecturas de ambos drivers

Fase 4: Cutover
  └── DB_DRIVER=postgres por defecto
  └── SQLite queda como fallback de dev/offline
```

### 7.2 Script de backfill

```bash
python3 ingest/migrate_sqlite_to_pg.py \
  --sqlite ./data/control-plane.db \
  --pg "$DATABASE_URL"
```

Lee todas las tablas de SQLite e inserta en PostgreSQL. Idempotente (UPSERT).

### 7.3 Test de paridad

```typescript
// src/lib/__tests__/parity.test.ts
test("SQLite y Postgres devuelven los mismos datos", async () => {
  const sqliteRepos = makeSqliteRepos();
  const pgRepos = makePostgresRepos();

  const sqliteSeries = await sqliteRepos.metric.getMetricSeries(30);
  const pgSeries = await pgRepos.metric.getMetricSeries(30);

  expect(pgSeries).toEqual(sqliteSeries);
});
```

---

## 8. Orden de implementación (revisado)

```
V2.d.1  Repository Pattern + driver Postgres
        ├── Crear src/lib/repo/ con interfaces (incluye RepoContext)
        ├── Implementar makeSqliteRepos() (envuelve queries.ts)
        ├── Implementar makePostgresRepos() (pg driver, application_name, statement_timeout)
        ├── Migrar 7 API routes a makeRepos(ctx)
        ├── Añadir pg + @types/pg como dependencia
        ├── Test de paridad
        └── DB_DRIVER flag

V2.d.4  Instrumentación
        ├── Tabla internal_metric (SQLite) / system_metric (PG)
        ├── Wrappers de latencia en historian, snapshot, API, DB
        ├── Contadores api_requests_total, api_errors_total por endpoint
        └── Métricas de recursos (RAM, heap, CPU, disco)

V2.d.3  System Health
        ├── GET /api/system-health (compone DbHealth + SnapshotHealth +
        │   HistorianHealth + ApiHealth + ResourceHealth)
        ├── Vista /system con tarjetas KPI extendidas
        ├── Badge de salud en header
        └── Test de endpoint

V2.d.2  Read Models
        ├── Crear tablas contributor_summary, conflict_hotspot, system_snapshot en PG
        ├── schema_version en cada read model (ADR-10)
        ├── historian.py como propietario (recalcula tras cada poll)
        ├── ContributorRepo lee de read model (PG) o calcula (SQLite)
        └── Test de paridad de read models
```

> **Orden revisado:** Instrumentación antes de System Health para que `/system`
> nasca ya alimentado por métricas reales. Read Models al final porque depende
> de que el Repository y la instrumentación estén en sitio.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| PG no disponible en dev | `DB_DRIVER=sqlite` por defecto; PG solo en producción |
| Paridad de datos incorrecta | Test de paridad automático antes de cutover |
| Performance de PG pool | Pool máximo 10 conexiones; idle timeout 30s |
| Migración de datos existente | Script idempotente; SQLite queda como respaldo |
| Breaking change en API routes | Cambio es solo de implementación, no de contrato JSON |

---

## 10. Contratos que NO cambian

Los siguientes JSON response **no cambian** en V2.d:

- `OverviewResponse`
- `PrsResponse`
- `IssuesResponse`
- `ContributorsResponse`
- `DiscordResponse`
- `SearchResponse`
- `HealthResponse` (se extiende con `SystemHealthData` en un endpoint nuevo)

El frontend sigue funcionando idénticamente.
