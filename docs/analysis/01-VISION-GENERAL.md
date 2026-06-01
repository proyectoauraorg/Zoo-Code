# Análisis Exhaustivo del Repositorio ZooDash

> **Autor del análisis:** MiMo-v2.5-pro (Xiaomi MiMo Team)  
> **Fecha:** 2026-05-30  
> **Alcance:** Estructura completa, arquitectura, dependencias, patrones, flujo de ejecución, convenciones, mejoras, vulnerabilidades y deuda técnica.

---

## 1. Visión General — ¿Qué es ZooDash?

**ZooDash** es un _dashboard operativo local_ que **lee** (nunca escribe) los artefactos producidos por el _Aura Context-Sync Runtime_ de `zSys`, los historiza en una base de datos SQLite y los presenta como una consola de inteligencia operacional para el repositorio OSS `Zoo-Code-Org/Zoo-Code`.

### Analogía cotidiana

Imagina un **tablero de instrumentos de un coche**. El motor (el runtime `zSys`) genera datos sobre velocidad, combustible, temperatura… pero no muestra nada por sí solo. ZooDash es el **cuadro de mandos**: lee esos datos del motor, los guarda en un cuaderno (SQLite) para tener historia, y los presenta en una pantalla bonita (Next.js + Tremor) para que el conductor (el equipo) pueda tomar decisiones.

### Principio rector

> **Solo lectura** sobre `Zoo-Code-Org/Zoo-Code` y sobre `.context_sync/`. No reescribe nada en el runtime.

---

## 2. Estructura de Carpetas

```
ZooDash/
├── ingest/                        # Pipeline de ingesta (Python)
│   ├── historian.py               # Lee snapshots → append idempotente a SQLite
│   └── schema.sql                 # DDL del modelo de datos v1
│
├── src/
│   ├── app/                       # Next.js App Router (rutas, layout, API)
│   │   ├── layout.tsx             # Shell global: sidebar + header + providers
│   │   ├── page.tsx               # "/" → Overview (KPIs, sparkline, feed)
│   │   ├── providers.tsx          # TanStack Query provider (client)
│   │   ├── error.tsx              # Error boundary de vista
│   │   ├── globals.css            # Design tokens (CSS vars, dark-first)
│   │   ├── fonts/                 # Geist Sans + Mono (woff)
│   │   ├── api/
│   │   │   ├── health/route.ts    # GET /api/health — barato, sin parsear PRs
│   │   │   ├── overview/route.ts  # GET /api/overview — KPIs + series + feed
│   │   │   ├── prs/route.ts       # GET /api/prs — Kanban con aging
│   │   │   └── issues/route.ts    # GET /api/issues — tabla de issues
│   │   ├── prs/page.tsx           # "/prs" → PR Board (Kanban)
│   │   └── issues/page.tsx        # "/issues" → Tabla con filtro
│   │
│   ├── components/
│   │   ├── AppHeader.tsx          # Header operacional global (sticky)
│   │   ├── Nav.tsx                # Sidebar desktop
│   │   ├── MobileNav.tsx          # Drawer hamburguesa (<sm)
│   │   ├── KpiCards.tsx           # 4 tarjetas KPI
│   │   ├── DriftBadge.tsx         # Badge de drift origin↔upstream
│   │   ├── Sparkline.tsx          # Chart de tendencia (Tremor)
│   │   ├── ActivityFeed.tsx       # Feed + eventos historizados
│   │   ├── PrKanban.tsx           # Kanban 5 columnas
│   │   ├── PrCard.tsx             # Tarjeta individual de PR
│   │   ├── AgingBadge.tsx         # Badge de días en columna
│   │   ├── IssueTable.tsx         # Tabla de issues
│   │   ├── PageHeader.tsx         # Subtítulo de vista
│   │   ├── skeletons.tsx          # Placeholders de carga
│   │   └── ui/                    # Primitivas UI (shadcn/ui-style)
│   │       ├── badge.tsx          # CVA badge con 8 variantes
│   │       ├── button.tsx         # CVA button (3 variantes × 3 tamaños)
│   │       ├── card.tsx           # Superficie base token-based
│   │       ├── empty-state.tsx    # Estado vacío operacional
│   │       ├── error-state.tsx    # Estado de error con retry
│   │       ├── segmented.tsx      # Control de tabs/filtro
│   │       ├── skeleton.tsx       # Shimmer placeholder
│   │       ├── table.tsx          # Tabla semántica accesible
│   │       ├── theme-toggle.tsx   # Toggle dark/light/system
│   │       └── tooltip.tsx        # Tooltip CSS puro
│   │
│   └── lib/
│       ├── api.ts                 # fetchJson + relativeTime (helper cliente)
│       ├── db.ts                  # Singleton SQLite (readonly, globalThis)
│       ├── kanban.ts              # Lógica pura: columna Kanban + aging
│       ├── nav.ts                 # Definición de links de navegación
│       ├── notify.ts              # Helper notificaciones (Apprise)
│       ├── queries.ts             # Consultas SQL: series, aging, eventos
│       ├── snapshots.ts           # Parser Zod de github.json + state.json
│       ├── types.ts               # Tipos del dominio (TypeScript)
│       ├── utils.ts               # cn() = clsx + tailwind-merge
│       └── __tests__/
│           ├── kanban.test.ts     # Tests de columna + aging
│           ├── snapshots.test.ts  # Tests de parseo del snapshot
│           └── github.sample.json # Fixture de test
│
├── deploy/
│   └── launchd/
│       └── com.zoodash.historian.plist  # Daemon macOS (cada 15 min)
│
├── docs/                          # Documentación del proyecto
│   ├── ui-ux/                     # Estándares de diseño
│   └── v2/                        # Especificación v2 (Postgres/Timescale)
│
├── package.json                   # Dependencias y scripts
├── pnpm-lock.yaml                 # Lockfile
├── tsconfig.json                  # Config TypeScript
├── next.config.mjs                # Config Next.js (vacía = defaults)
├── tailwind.config.ts             # Config Tailwind (extensa: tokens + Tremor)
├── postcss.config.mjs             # PostCSS (solo tailwindcss)
├── vitest.config.ts               # Config Vitest
└── .eslintrc.json                 # ESLint (next/core-web-vitals + typescript)
```

### Interpretación para principiantes

La carpeta `src/` sigue el patrón de **Next.js App Router**: cada carpeta dentro de `app/` es una ruta URL. Si ves `src/app/prs/page.tsx`, eso significa que cuando alguien visita `http://localhost:3939/prs`, Next.js renderiza ese componente. La carpeta `lib/` es como una "caja de herramientas" — funciones reutilizables que no son componentes visuales sino lógica de negocio (consultas a la base de datos, parseo de datos, etc.).
