# 🦓 ZooDash — Zoo Code Control Plane (v1)

Dashboard local que **historiza y visualiza** la actividad de contribución OSS sobre
`Zoo-Code-Org/Zoo-Code`. **No reimplementa la recolección**: lee los snapshots que ya
emite el _Aura Context-Sync Runtime_ (en `zSys`), los historiza en SQLite y los muestra.

> Proyecto **independiente** de `zSys` y de ZordonOS. Solo **lee** los artefactos del
> runtime (nunca los muta) y no toca el fork ni el upstream.

```text
Aura Context-Sync Runtime              ZooDash (este proyecto)
 .context_sync/snapshots/github.json ──►  ingest/historian.py  ──►  data/control-plane.db (SQLite)
 .context_sync/state.json             (lee)   (append por poll + pr_event)        │
 surfacing/notify.py (Apprise)  ◄── invoca ── lib/notify.ts / historian --notify  │
                                                                                  ▼
                                          Next.js Route Handlers (/api/*) ──► UI (Overview · PR Board · Issues)
```

**Regla de lectura:** _estado actual_ = snapshot vivo (`github.json`); _historia / tendencias /
aging_ = SQLite.

---

## Requisitos

- **Node 20 LTS** (probado en `20.20.2`; evita Node 22) y **pnpm 10**.
- **Python 3** para el historian (stdlib; sin dependencias externas).
- El _Context-Sync Runtime_ corriendo en `zSys` (es quien regenera los snapshots).

```bash
nvm use 20          # o: nvm install 20.20.2
node -v && pnpm -v  # v20.x / 10.x
```

## Instalación

```bash
pnpm install
cp /Users/dr.armandovaquera/zSys/zControlPlane/.env.example .env.local   # ya incluido en el repo
```

## Configuración (`.env.local`)

Rutas reales a los artefactos del runtime (solo lectura) y umbrales de alerta:

| Variable | Para qué |
|---|---|
| `GITHUB_SNAPSHOT`, `STATE_JSON` | snapshots que lee la app (estado actual + feed) |
| `DATABASE_PATH` | SQLite local (`./data/control-plane.db`) que rellena el historian |
| `NOTIFY_SCRIPT`, `PYTHON_BIN` | `surfacing/notify.py` (Apprise) y el python del runtime |
| `STALE_PR_DAYS`, `CI_RED_ALERT_DAYS` | umbrales de las alertas |
| `POLL_REFRESH_SECONDS` / `NEXT_PUBLIC_POLL_REFRESH_SECONDS` | cada cuánto refetchea la UI |

## Uso

**1) Historizar (poblar la DB).** Cada ejecución lee el snapshot y hace _append_ idempotente:

```bash
pnpm historian              # = python3 ingest/historian.py
python3 ingest/historian.py --notify    # además dispara Apprise (CI roja / conflicto / stale)
```

- Es **idempotente**: correrlo dos veces con el mismo `fetched_at` no duplica filas.
- Calcula `pr_event` (transiciones) diffeando el poll actual contra el anterior.

**2) Levantar el dashboard:**

```bash
pnpm dev                    # http://localhost:3939
```

**3) Programar el historian** (para construir series). Ejemplo con `cron` (cada 10 min):

```cron
*/10 * * * * cd /Users/dr.armandovaquera/ZooDash && /usr/bin/python3 ingest/historian.py --notify >> /tmp/zoodash-historian.log 2>&1
```

> El runtime ya tiene su propio poller que regenera los snapshots; el historian puede
> colgarse de esa cadencia (o correr en su propio cron, leyendo el último snapshot).

## Vistas

- **`/` Overview** — KPIs (PRs abiertos/mergeados, issues, CI roja), drift badge, release,
  feed de actividad (`state.json.deltas` + `pr_event`) y sparkline de PRs abiertos.
- **`/prs` PR Board** — Kanban `Draft → Review → Changes Requested → Approved → Merged`
  (derivado de `state`+`reviewDecision`+`isDraft`), con badge de CI, `⚠` si `CONFLICTING`,
  _aging_ (días en la columna) y resalte de bottlenecks.
- **`/issues`** — tabla con estado/labels/asignado/actualización y filtro por estado.

## Datos: ¿de dónde sale cada cosa?

- **Estado actual** (números de KPIs, tarjetas de PR, tabla de issues) → del **snapshot vivo**
  `github.json`, validado con Zod (degrada con elegancia ante campos vacíos).
- **Tendencias / sparkline / merged-esta-semana / aging** → de **SQLite** (`repo_metric`,
  `pr_snapshot`, `pr_event`), que rellena el historian.

## Notificaciones

Reusa el **Apprise** del runtime (`surfacing/notify.py`); no crea sistema nuevo. Disparadores:
CI pasa a roja, PR marcado `CONFLICTING`, PR _stale_ (> `STALE_PR_DAYS` sin update con review
pendiente). Si no hay `AURA_APPRISE_URLS`, cae a notificación de escritorio (osascript).

## Calidad

```bash
pnpm test               # vitest: parser de snapshot + columna Kanban + aging
pnpm lint               # eslint
pnpm exec tsc --noEmit  # typecheck
pnpm build              # build de producción
```

## Estructura

```text
ZooDash/
├── ingest/
│   ├── historian.py        lee snapshots → append idempotente a SQLite + pr_event
│   └── schema.sql          esquema (copia de zControlPlane/DATA_MODEL.sql)
├── src/
│   ├── lib/                db.ts · snapshots.ts (Zod) · queries.ts · kanban.ts · notify.ts
│   ├── app/                layout · page (Overview) · prs/ · issues/ · api/{overview,prs,issues}
│   └── components/         KpiCards · DriftBadge · ActivityFeed · Sparkline · PrKanban · PrCard · AgingBadge · IssueTable
└── data/control-plane.db   (gitignored; lo crea el historian)
```

## Gobernanza (innegociable)

- Solo **lectura** sobre `Zoo-Code-Org/Zoo-Code` y sobre `.context_sync/`.
- No escribir en `Zoo-Code-contrib` (el fork queda limpio). No abrir PRs/issues en upstream.
- Commits sin trailer de IA (autor: Armando Vaquera).
- Stack v1 bloqueado: Next.js 14 · Tremor · shadcn/ui · TanStack Query · better-sqlite3 · Zod ·
  Node 20 · pnpm. (Postgres/Timescale/Redis/NATS = v2.)
