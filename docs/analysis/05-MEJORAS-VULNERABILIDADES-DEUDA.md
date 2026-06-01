## 6. Mejoras, Vulnerabilidades y Deuda Técnica

### 6.1 Vulnerabilidades de seguridad

#### 🔴 V1 — Path traversal en variables de entorno

**Archivos:** [`snapshots.ts`](src/lib/snapshots.ts:88), [`db.ts`](src/lib/db.ts:13)

Las rutas a `GITHUB_SNAPSHOT`, `STATE_JSON` y `DATABASE_PATH` se toman directamente de `process.env` sin sanitización. Un atacante con acceso al `.env.local` podría apuntar a archivos arbitrarios del sistema.

```typescript
// snapshots.ts línea 88 — lee cualquier archivo JSON del filesystem
function readJson(path: string | undefined): unknown | null {
  if (!path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch { return null; }
}
```

**Riesgo real:** Bajo (es un dashboard local, no expuesto a internet). Pero si alguna vez se despliega en red, es crítico.

**Mitigación sugerida:** Validar que las rutas estén dentro de un directorio permitido (allowlist).

#### 🟡 V2 — No hay validación de tamaño de snapshot

[`readJson()`](src/lib/snapshots.ts:88) lee el archivo completo a memoria. Un snapshot malicioso o corrupto de varios GB podría agotar la memoria del proceso Node.js.

**Mitigación:** Limitar el tamaño del archivo antes de leer (p.ej., `fs.statSync(path).size < 50MB`).

#### 🟡 V3 — Spawn sin validación de binario en notify.ts

[`notify.ts`](src/lib/notify.ts:28) ejecuta `PYTHON_BIN` de `process.env` sin validar que sea un binario legítimo.

```typescript
const pythonBin = process.env.PYTHON_BIN || "python3";
// Se podría inyectar un path malicioso en PYTHON_BIN
```

**Riesgo:** Bajo (solo afecta a quien controla `.env.local`).

### 6.2 Deuda técnica

#### 🟠 D1 — `next.config.mjs` está vacía

[`next.config.mjs`](next.config.mjs) no tiene ninguna configuración. Ausencias notables:

- No hay `images.domains` o `images.remotePatterns` (si alguna vez se añaden imágenes externas)
- No hay headers de seguridad (`X-Frame-Options`, `Content-Security-Policy`)
- No hay `output: 'standalone'` para despliegue en contenedor
- No hay `experimental` flags para optimización

#### 🟠 D2 — Sin middleware de seguridad

No existe `src/middleware.ts`. En un dashboard local no es crítico, pero si se expone en red:

- No hay rate limiting
- No hay autenticación
- No hay CORS configurado
- No hay headers de seguridad

#### 🟠 D3 — Todos los componentes de página son `"use client"`

[`page.tsx`](src/app/page.tsx:1), [`prs/page.tsx`](src/app/prs/page.tsx:1), [`issues/page.tsx`](src/app/issues/page.tsx:1) — todas las páginas son client-side.

**Consecuencia:** El HTML inicial no tiene contenido (solo el shell del layout). Los motores de búsqueda no verían nada, y el First Contentful Paint depende completamente de la hidratación de JavaScript.

**Mejora potencial:** Usar Server Components para el HTML inicial + hidratar los datos dinámicos con `<Suspense>`.

#### 🟠 D4 — Sin paginación en queries SQL

[`getMetricSeries()`](src/lib/queries.ts:16) y [`getRecentEvents()`](src/lib/queries.ts:68) usan `LIMIT` pero [`getColumnEntryTimes()`](src/lib/queries.ts:102) carga **TODA** la tabla `pr_snapshot` a memoria:

```typescript
// queries.ts línea 107-113 — carga TODOS los snapshots de TODOS los PRs
const rows = db.prepare(
  `SELECT number, ts, state, review_decision, is_draft
   FROM pr_snapshot ORDER BY number ASC, ts ASC`
).all() as PrHistoryRow[];
```

**Riesgo:** A medida que la DB crece (cada 15 min × 96 snapshots/día × N PRs), esta query se vuelve cada vez más lenta. Con 100 PRs y 30 días de historia = ~288,000 filas cargadas a memoria.

**Mejora:** Filtrar por PRs abiertos actuales + ventana temporal, o materializar el resultado.

#### 🟠 D5 — Sin tests de integración ni E2E

Solo hay 2 archivos de test:
- [`kanban.test.ts`](src/lib/__tests__/kanban.test.ts) — tests unitarios de lógica pura ✅
- [`snapshots.test.ts`](src/lib/__tests__/snapshots.test.ts) — test de parseo del snapshot ✅

Faltan:
- Tests de las API routes (¿devuelven el JSON correcto?)
- Tests de los queries SQL (¿usan la DB correctamente?)
- Tests de componentes (¿renderizan correctamente?)
- Tests E2E (¿el flujo completo funciona?)

#### 🟠 D6 — Hardcoded path en historian.py e historián plist

[`historian.py`](ingest/historian.py:329) tiene un path hardcoded como fallback:

```python
gh_path = Path(args.github or env.get(
    "GITHUB_SNAPSHOT",
    "/Users/dr.armandovaquera/zSys/.context_sync/snapshots/github.json"))
```

[`com.zoodash.historian.plist`](deploy/launchd/com.zoodash.historian.plist:13) también tiene paths absolutos:

```xml
<string>/Users/dr.armandovaquera/ZooDash/ingest/historian.py</string>
```

**Problema:** No funciona en otra máquina sin editar estos archivos.

#### 🟡 D7 — No hay lint-staged ni pre-commit hooks

No hay configuración de husky/lint-staged. Los commits no se validan automáticamente (lint, typecheck, tests).

#### 🟡 D8 — ESLint mínimo

[`.eslintrc.json`](.eslintrc.json) solo extiende `next/core-web-vitals` y `next/typescript`. No hay reglas personalizadas para:
- Prohibir `console.log` en producción
- Forzar orden de imports
- Validar accesibilidad extra (jsx-a11y rules beyond defaults)

#### 🟡 D9 — `lucide-react` instalado pero no usado

[`lucide-react`](package.json:24) está en dependencias pero no se importa en ningún archivo. Los iconos se usan como emojis directamente.

### 6.3 Posibles mejoras funcionales

| # | Mejora | Impacto | Esfuerzo |
|---|--------|---------|----------|
| M1 | **Server Components** — Mover fetch de datos al servidor | Mejor FCP, SEO, menos JS al cliente | Medio |
| M2 | **Streaming con `<Suspense>`** — Cargar KPIs primero, sparkline después | Mejor perceived performance | Bajo |
| M3 | **Retry con backoff exponencial** en TanStack Query | Mejor resiliencia ante caídas temporales | Bajo |
| M4 | **Dark mode por defecto correcto** — El script inline usa `localStorage` pero el SSR siempre pone `class="dark"` | Consistencia SSR/CSR | Bajo |
| M5 | **Prefetch de rutas** — Next.js puede prefetch `/prs` y `/issues` al hover | Navegación instantánea | Bajo |
| M6 | **Virtualización** en la tabla de issues y en las columnas del Kanban | Mejor rendimiento con muchos items | Medio |
| M7 | **Export a CSV/PDF** de PRs e issues | Utilidad para reportes | Medio |
| M8 | **Filtros avanzados** en PR Board (por label, autor, CI) | Mejor triage | Medio |
| M9 | **WebSocket/SSE** para updates en tiempo real en vez de polling | Menos carga, datos más frescos | Alto (requiere cambio de arquitectura) |
| M10 | **Compresión GZIP/Brotli** de respuestas API | Menos ancho de banda | Bajo |

---

## 7. Análisis por Módulo Detallado

### 7.1 `ingest/historian.py` — El corazón de la ingesta

**Líneas:** 367 | **Lenguaje:** Python 3 (stdlib) | **Dependencias:** Cero

**Puntos fuertes:**
- **Idempotencia garantizada**: Check de `poll.ts` antes de INSERT (línea 207)
- **Transaccionalidad**: Todo el INSERT va dentro de `with conn:` (línea 224) — si algo falla, nada se escribe
- **Cálculo de eventos inteligente**: Diff contra el poll anterior para generar transiciones
- **Notificaciones integradas**: Detección de CI roja, conflictos, PRs stale
- **CLI bien diseñada**: `argparse` con overrides para tests

**Puntos débiles:**
- El parser de `.env.local` (líneas 40-52) es frágil: no soporta multiline values, comentarios inline con `#` en el valor, ni variables con espacios en el nombre
- `kanban_column()` devuelve `"Closed"` para CLOSED (línea 60), pero el frontend devuelve `null` para CLOSED en [`kanban.ts`](src/lib/kanban.ts:24). Esta asimetría es intencional pero no documentada

### 7.2 `src/lib/snapshots.ts` — El parser Zod

**Líneas:** 204 | **Lenguaje:** TypeScript

**Puntos fuertes:**
- Schema Zod extremadamente tolerante con `.catch()` y `.default()` en cada campo
- Helper `cleanStr()` para normalizar `"undefined"` literal a `null`
- Separación clara entre `readGithubSnapshot()` (completo) y `readGithubHealth()` (ligero)

**Observación:** El schema usa `z.coerce.number().catch(0)` que convierte strings a números. Esto es robusto pero podría enmascarar datos corruptos silenciosamente.

### 7.3 `src/lib/kanban.ts` — Lógica pura testeable

**Líneas:** 62 | **Lenguaje:** TypeScript

**Puntos fuertes:**
- 100% puro (sin efectos colaterales, sin DB, sin I/O)
- Algoritmo `columnEntryTs()` elegante: recorre la historia hacia atrás hasta encontrar una columna diferente
- Espejo exacto del Python (comentado en línea 17)
- Tests completos que cubren los casos edge

### 7.4 `src/lib/db.ts` — Conexión singleton

**Líneas:** 33 | **Lenguaje:** TypeScript

**Puntos fuertes:**
- Patrón `globalThis` para sobrevivir hot-reload
- Devuelve `null` si la DB no existe (degradación elegante)
- `readonly: true, fileMustExist: true` — nunca crea ni escribe

**Observación:** No hay `PRAGMA journal_mode=WAL` ni `PRAGMA cache_size`. Para lectura, el default (DELETE journal) está bien, pero WAL sería más eficiente si hubiera lectores concurrentes.

### 7.5 Componentes UI

La capa de componentes sigue un patrón **atómico** bien estructurado:

- **Primitivas** (`ui/`): Badge, Button, Card, Table, Skeleton, Tooltip, Segmented, EmptyState, ErrorState, ThemeToggle
- **Compuestos**: KpiCards, PrKanban, PrCard, IssueTable, ActivityFeed
- **Layout**: AppHeader, Nav, MobileNav, PageHeader
- **Skeletons**: OverviewSkeleton, KanbanSkeleton, TableSkeleton

Todos los componentes usan tokens semánticos (`text-fg`, `bg-surface`, `border-line`) en vez de colores hardcodeados. Esto garantiza consistencia visual y soporte de temas.

### 7.6 Accesibilidad (a11y)

El proyecto tiene un nivel de accesibilidad **por encima del promedio**:

- ✅ `skip-link` para navegación por teclado ([`globals.css`](src/app/globals.css:113))
- ✅ `focus-visible` con outline claro ([`globals.css`](src/app/globals.css:101))
- ✅ `prefers-reduced-motion` respeta usuarios con sensibilidad al movimiento ([`globals.css`](src/app/globals.css:129))
- ✅ `aria-label` en todos los elementos interactivos
- ✅ `aria-current="page"` en navegación activa
- ✅ `aria-live="polite"` en el estado del snapshot
- ✅ `role="alert"` en estados de error
- ✅ `role="status"` en skeletons
- ✅ `sr-only` text complementario en badges
- ✅ `role="dialog"` + `aria-modal` en el drawer móvil
- ✅ Escape para cerrar el drawer
- ✅ Bloqueo de scroll cuando el drawer está abierto

---

## 8. Riesgos Operacionales

### 8.1 Dependencia del runtime externo

ZooDash depende completamente del _Aura Context-Sync Runtime_ de `zSys`. Si el runtime deja de emitir snapshots:

- La UI muestra `stale: true` y el dot se vuelve amarillo/rojo
- La DB no crece (no hay nuevos polls)
- Los datos se congelan en el último snapshot

**Mitigación actual:** El [`/api/health`](src/app/api/health/route.ts) detecta snapshots de más de 15 minutos como stale.

### 8.2 Crecimiento de la DB

Con polls cada 15 minutos y 50 PRs activos:
- `repo_metric`: 96 filas/día
- `pr_snapshot`: 4,800 filas/día (96 × 50)
- `pr_event`: variable

En un mes: ~150,000 filas en `pr_snapshot`. La query de `getColumnEntryTimes()` carga todo esto. **Sin retención ni particionamiento, la DB crece indefinidamente.**

### 8.3 Single point of failure: SQLite

SQLite soporta múltiples lectores pero un solo escritor. Si `historian.py` está escribiendo mientras Next.js lee, hay un bloqueo momentáneo. En la práctica, con `better-sqlite3` en modo readonly y el historian corriendo por separado, esto no debería causar problemas — pero no hay manejo explícito de `SQLITE_BUSY`.
