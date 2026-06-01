## 5. Patrones de Diseño y Convenciones

### 5.1 Patrones arquitectónicos

#### Patrón: Degradación elegante (Graceful Degradation)

Todo el código está diseñado para **no romperse** cuando falta algo. Es como una casa con cimientos flexibles: si se sacude un terremoto (dato faltante), la casa se dobla pero no se cae.

**Ejemplos concretos:**

- [`getDb()`](src/lib/db.ts:21) devuelve `null` si la DB no existe → las queries devuelven `[]` o `0`
- [`readGithubSnapshot()`](src/lib/snapshots.ts:111) devuelve `null` si no puede leer/parsear → la API devuelve `ok: false, stale: true`
- Cada campo en [`snapshots.ts`](src/lib/snapshots.ts) tiene `.catch(0)` o `.catch("")` → Zod nunca lanza
- [`notifyCritical()`](src/lib/notify.ts:18) nunca lanza errores → devuelve `false` silenciosamente
- La UI muestra [`ErrorState`](src/components/ui/error-state.tsx) con botón de retry en vez de pantalla blanca

#### Patrón: Singleton con globalThis cache

[`getDb()`](src/lib/db.ts:21) usa `globalThis.__zoodashDb` para cachear la conexión SQLite.

```
¿Por qué globalThis?
En desarrollo, Next.js hace "hot-reload" cuando guardas un archivo.
Sin el cache en globalThis, cada hot-reload crearía una NUEVA conexión a la DB,
acumulando conexiones abiertas hasta saturar el sistema.
globalThis sobrevive al hot-reload porque es el objeto global de Node.js.
```

#### Patrón: Parser tolerante con Zod

[`snapshots.ts`](src/lib/snapshots.ts) es el punto de entrada de datos externos. Usa un patrón de **validación con degradación**:

```typescript
// Ejemplo: el campo ci.state podría no existir
const CiSchema = z.object({
  state: Str.default("none"),    // si falta → "none"
  passed: Num,                    // si falta → 0 (por coerce.number().catch(0))
  failed: Num,
  pending: Num,
}).catch({ state: "none", passed: 0, failed: 0, pending: 0 });
// ↑ si TODO el objeto ci falla → defaults completos
```

Esto es como un **formulario inteligente**: si alguien deja un campo vacío, no se rompe todo, sino que se pone un valor razonable por defecto.

#### Patrón: Derivación pura (sin efectos colaterales)

[`kanban.ts`](src/lib/kanban.ts) es **puro**: toma datos, devuelve resultados, no toca la DB ni la red. Esto hace que sea **100% testeable** sin mocks.

```
¿Qué es una "función pura"?
Imagina una calculadora: le das 2+2, siempre obtienes 4.
No importa cuándo la uses, dónde, ni qué hora sea.
Una función pura es igual: mismas entradas → mismas salidas, siempre.
```

#### Patrón: Event sourcing ligero

La tabla [`pr_event`](ingest/schema.sql:72) almacena **transiciones** (diff entre polls), no snapshots completos. El `historian.py` calcula eventos comparando el poll actual contra el anterior:

```python
# historián.py línea 149-188
def compute_events(prev_prs, curr_prs):
    # PR nuevo → evento "new"
    # PR era OPEN y ahora MERGED → evento "merged"
    # CI pasó de pass a fail → evento "ci_red"
    # etc.
```

Es como un **diario de cambios**: en vez de guardar "el PR está en Review", guarda "el PR pasó de Draft a Review a las 3pm".

### 5.2 Patrones de UI

#### Patrón: Componentes compuestos (shadcn/ui style)

Las primitivas UI en [`src/components/ui/`](src/components/ui/) siguen el patrón shadcn/ui:

- [`Card`](src/components/ui/card.tsx) — `forwardRef`, composición libre (el padding lo decide el consumidor)
- [`Badge`](src/components/ui/badge.tsx) — `cva` (class-variance-authority) para variantes tipadas
- [`Button`](src/components/ui/button.tsx) — `cva` con variantes y tamaños
- [`Table`](src/components/ui/table.tsx) — Componentes semánticos (`THead`, `TBody`, `TR`, `TH`, `TD`)

```
¿Qué es "shadcn/ui style"?
En vez de instalar una librería de componentes gigante (como Material UI),
copias SOLO los componentes que necesitas directo en tu proyecto.
Así tienes control total sobre el código y no dependes de actualizaciones externas.
Es como cocinar tu propia pizza en vez de pedir delivery: más trabajo, pero controlas los ingredientes.
```

#### Patrón: Design tokens como CSS variables

[`globals.css`](src/app/globals.css) define tokens semánticos como `--color-bg`, `--color-surface`, `--color-danger`, etc. que luego Tailwind referencia via `tailwind.config.ts`:

```css
/* globals.css */
.dark {
  --color-danger: #f87171;    /* rojo para dark mode */
  --color-danger-bg: #2a1414; /* fondo rojo oscuro */
}
```
```typescript
// tailwind.config.ts
colors: {
  danger: { DEFAULT: "var(--color-danger)", bg: "var(--color-danger-bg)" },
}
```

```
¿Por qué CSS variables en vez de hardcodear colores?
Imagina que tu app usa "rojo" para errores. Si hardcodeas "#ff0000" en 50 componentes,
y luego quieres cambiar el rojo, tienes que buscar y reemplazar en 50 sitios.
Con variables, cambias UNA línea en globals.css y los 50 componentes se actualizan.
```

#### Patrón: Dark-first con script sin-FOUC

[`layout.tsx`](src/app/app/layout.tsx:29) incluye un script inline que se ejecuta **antes del primer paint** del navegador para aplicar el tema. Esto evita el "Flash of Unstyled Content" (FOUC) — el molesto parpadeo de tema claro antes de cambiar a oscuro.

```javascript
// Se ejecuta en el <head> ANTES de que React renderice nada
(function(){
  var t = localStorage.getItem('theme');
  if(t==='light') { /* quita dark */ }
  else { document.documentElement.classList.add('dark'); }
})();
```

### 5.3 Convenciones del proyecto

| Convención | Ejemplo | Comentario |
|-----------|---------|------------|
| **Imports con alias `@/`** | `import { getDb } from "@/lib/db"` | Evita rutas relativas `../../../` |
| **Componentes como named exports** | `export function KpiCards()` | No hay `export default` en componentes |
| **Páginas como default exports** | `export default function OverviewPage()` | Requerido por Next.js App Router |
| **`"use client"` en páginas** | `src/app/page.tsx` línea 1 | Todas las páginas son client-side (usan TanStack Query) |
| **Force-dynamic en API routes** | `export const dynamic = "force-dynamic"` | Nunca cachear respuestas de API |
| **Runtime nodejs** | `export const runtime = "nodejs"` | Necesario para `better-sqlite3` (no Edge) |
| **Tipos separados** | `src/lib/types.ts` | Fuente única de verdad para tipos del dominio |
| **Español en UI y comentarios** | `"hace 3h"`, `"Sin novedades."` | La interfaz está en español |
| **Emojis en UI** | `🔀`, `✅`, `🐛` | Para iconografía rápida sin dependencia de icon library |
| **`sr-only` para accesibilidad** | `<span className="sr-only">CI fallando</span>` | Info para lectores de pantalla |
| **`aria-*` attributes** | `aria-label`, `aria-current`, `aria-live` | Accesibilidad semántica |

### 5.4 Modelo de datos

El schema SQL ([`ingest/schema.sql`](ingest/schema.sql)) define 5 tablas:

```
poll (ts PK)                    ← Cada ejecución del historian
  ├── repo_metric (ts FK→poll)  ← Métricas agregadas del repo
  ├── pr_snapshot (ts,number)   ← Estado de cada PR en cada poll
  ├── issue_snapshot (ts,number)← Estado de cada issue en cada poll
  └── pr_event (id auto)        ← Transiciones derivadas (diff)
```

**Índices:**
- `idx_pr_snapshot_number ON pr_snapshot(number, ts)` — para buscar historia de un PR
- `idx_issue_snapshot_number ON issue_snapshot(number, ts)` — idem para issues
- `idx_pr_event_number ON pr_event(number, ts)` — para buscar eventos de un PR
- `idx_pr_event_ts ON pr_event(ts)` — para ordenar eventos cronológicamente

**Tabla opcional:** `discord_activity` — preparada para v1.5 pero no implementada.
