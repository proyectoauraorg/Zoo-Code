## 4. Arquitectura del Código

### 4.1 Diagrama de flujo de datos

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Aura Context-Sync Runtime (zSys)                 │
│  Recolecta datos de GitHub → genera archivos JSON                   │
│    .context_sync/snapshots/github.json  (estado actual)             │
│    .context_sync/state.json             (feed de novedades)         │
└──────────┬──────────────────────────────────┬───────────────────────┘
           │ Lee (solo lectura)               │ Lee (solo lectura)
           ▼                                  ▼
┌─────────────────────┐            ┌─────────────────────┐
│ ingest/historian.py │            │ src/lib/snapshots.ts │
│ (Python, cron/      │            │ (Zod, en Next.js)    │
│  launchd cada 15min)│            │                      │
└──────────┬──────────┘            └──────────┬───────────┘
           │ INSERT                          │ readGithubSnapshot()
           │ idempotente                     │ readStateSnapshot()
           ▼                                 ▼
┌─────────────────────┐            ┌─────────────────────┐
│ SQLite (data/       │            │ API Routes           │
│ control-plane.db)   │◄───────────│ /api/overview        │
│                     │  queries   │ /api/prs             │
│ • poll              │            │ /api/issues          │
│ • repo_metric       │            │ /api/health          │
│ • pr_snapshot       │            └──────────┬───────────┘
│ • issue_snapshot    │                       │ JSON
│ • pr_event          │                       ▼
└─────────────────────┘            ┌─────────────────────┐
                                   │ React Components     │
                                   │ (TanStack Query      │
                                   │  polling cada 60s)   │
                                   │                      │
                                   │ / → Overview         │
                                   │ /prs → PR Kanban     │
                                   │ /issues → Issues     │
                                   └──────────────────────┘
```

### 4.2 Capas de la aplicación

El código está organizado en **4 capas** con responsabilidades claras:

#### Capa 1: Ingesta (`ingest/`)

El [`historian.py`](ingest/historian.py) es un script Python independiente (stdlib, cero dependencias externas) que:

1. **Lee** `github.json` del runtime
2. **Parsea** los items (PRs, issues, drift, release)
3. **Calcula eventos** diffando contra el poll anterior (transiciones de estado, CI roja, conflictos)
4. **Inserta** todo en SQLite de forma **idempotente** (si el `fetched_at` ya existe, skip)

```
¿Qué significa "idempotente"?
Imagina que tienes un sello de goma que dice "RECIBIDO" con la fecha.
Si sellas dos veces el mismo papel con la misma fecha, solo se ve UN sello.
El historian funciona igual: correrlo 10 veces con el mismo snapshot = 1 sola fila en la DB.
```

#### Capa 2: Persistencia y Consultas (`src/lib/`)

| Módulo | Responsabilidad |
|--------|----------------|
| [`db.ts`](src/lib/db.ts) | Singleton de SQLite readonly. Cachea la conexión en `globalThis` para sobrevivir al hot-reload de Next.js en desarrollo. Devuelve `null` si la DB no existe (degradación elegante). |
| [`snapshots.ts`](src/lib/snapshots.ts) | Parser Zod de `github.json` y `state.json`. Cada campo tiene `.catch()` o `.default()` para tolerar snapshots parciales. |
| [`queries.ts`](src/lib/queries.ts) | Consultas SQL puras: series de métricas, PRs mergeados por semana, eventos recientes, tiempos de entrada a columna (aging). |
| [`kanban.ts`](src/lib/kanban.ts) | Lógica pura (sin DB): derivar columna Kanban de `state + reviewDecision + isDraft`, y calcular el `columnEntryTs` (timestamp de entrada a la columna actual). |
| [`types.ts`](src/lib/types.ts) | Definiciones TypeScript del dominio: `GithubSnapshot`, `PrCurrent`, `KanbanColumn`, etc. |
| [`api.ts`](src/lib/api.ts) | Helper cliente: `fetchJson<T>()` y `relativeTime()` (formato "hace 3h"). |
| [`notify.ts`](src/lib/notify.ts) | Wrapper para invocar `notify.py` del runtime vía `child_process.spawn`. |
| [`nav.ts`](src/lib/nav.ts) | Definición de links de navegación (compartido entre sidebar y drawer móvil). |
| [`utils.ts`](src/lib/utils.ts) | `cn()` = `clsx` + `tailwind-merge` (helper estándar de shadcn/ui). |

#### Capa 3: API (`src/app/api/`)

Cuatro Route Handlers de Next.js, todos con `runtime = "nodejs"` y `force-dynamic` (nunca se cachean):

| Endpoint | Lee snapshot | Lee DB | Complejidad |
|----------|-------------|--------|-------------|
| [`/api/health`](src/app/api/health/route.ts) | Sí (ligero: solo `fetched_at` + `ok`) | No | Mínima — endpoint de sondeo barato |
| [`/api/overview`](src/app/api/overview/route.ts) | Sí (completo) | Sí (series, merged, eventos) | Media — el más pesado |
| [`/api/prs`](src/app/api/prs/route.ts) | Sí (PRs) | Sí (aging/entry times) | Media — requiere calcular columna + aging |
| [`/api/issues`](src/app/api/issues/route.ts) | Sí (issues) | No | Baja — solo reexpone issues del snapshot |

#### Capa 4: UI (`src/app/` + `src/components/`)

Tres páginas, todas `"use client"` con TanStack Query haciendo polling:

- **`/` Overview**: KPIs + Sparkline (code-split con `dynamic()`) + ActivityFeed
- **`/prs` PR Board**: Kanban 5 columnas con `PrCard` (CI badge, conflict badge, aging badge)
- **`/issues`**: Tabla con filtro segmentado (ALL/OPEN/CLOSED), persistido en localStorage

### 4.3 Flujo de ejecución completo

```
1. [Cada 15 min] launchd ejecuta historian.py
   → Lee github.json → calcula diff → INSERT en SQLite

2. [Usuario abre localhost:3939]
   → Next.js SSR: layout.tsx renderiza shell (sidebar + header)
   → Client hydration: TanStack Query inicia polling

3. [Cada 60s] TanStack Query dispara:
   → GET /api/health → dot verde/amarillo/rojo en header
   → GET /api/overview → KPIs + sparkline + feed
   → GET /api/prs → Kanban actualizado
   → GET /api/issues → Tabla actualizada

4. [Cada API route]
   → Lee github.json (snapshot vivo) con Zod
   → Lee SQLite (historia) con better-sqlite3
   → Combina y devuelve JSON
```
