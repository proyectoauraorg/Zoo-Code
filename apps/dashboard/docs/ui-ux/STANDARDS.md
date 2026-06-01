# ZooDash · Estándares y convenciones de UI/UX (contrato congelado)

> **Estado:** contrato visual **congelado** (2026-05-29) para la fase de mejora UI/UX.
> Lo respetan **todos** los flancos (ver [PLAN.md](./PLAN.md)). Cambiarlo es un cambio de
> _contrato_: requiere acuerdo explícito porque afecta a flancos en curso.
>
> **Identidad:** ZooDash NO es un SaaS "marketing polished". Es una **Operational
> Intelligence Console** — mezcla de observabilidad operacional, control plane cognitivo,
> dashboard DevOps/SRE y consola de coordinación OSS. La configuración óptima maximiza
> **velocidad cognitiva, scanning visual, densidad útil, priorización de señal y tiempo de
> decisión** — no el lucimiento.
>
> **Regla de oro:** los componentes consumen **tokens**, nunca valores crudos. Un flanco
> cambia un token en su _namespace_ y el resto se actualiza sin tocar archivos ajenos. La
> aislación se garantiza por **propiedad de archivos/secciones** + **contrato de tokens** (§7).

---

## 1. Principios de diseño

1. **Operational Intelligence Console.** Inspiración híbrida: **Linear** (claridad/jerarquía),
   **GitHub** (semántica PR/issues), **Grafana** (dashboards operacionales), **Vercel**
   (refinamiento), **Raycast** (densidad elegante), **Datadog** (estados/observabilidad).
2. **Densidad "dense but breathable".** Alta información por viewport, ritmo vertical compacto,
   grids consistentes, jerarquía extremadamente clara. **NO** whitespace de landing, tarjetas
   gigantes ni padding excesivo.
3. **El estado primero.** CI roja, conflictos y aging se leen en < 3 s. El color comunica
   **severidad, estado, prioridad, aging y riesgo** — nunca branding decorativo.
4. **Degradar siempre, nunca romper.** Cada dato puede faltar; toda vista tiene estados
   _loading / empty / error / stale_ explícitos y accionables.
5. **Accesible por defecto.** WCAG 2.1 AA es el piso (contraste, foco, teclado, reduced-motion,
   targets táctiles).
6. **Invisible motion.** Movimiento corto, funcional, sutil (120–180ms, opacity/transform).
   Sin bounce/elastic/spring ornamental. Respeta `prefers-reduced-motion`.
7. **Coherencia > novedad.** Un único sistema de tokens y primitivos. Repetido dos veces → a
   `components/ui`.

---

## 2. Design tokens (fuente única de verdad)

Viven como **CSS custom properties** en `src/app/globals.css` (secciones etiquetadas, §7) y se
exponen a Tailwind vía `tailwind.config.ts`. **Dark-first**: `:root` define el tema claro
(secundario) y `.dark` el oscuro (primario); `<html>` arranca con `class="dark"`.

### 2.1 Color (namespace `--color-*`) — propiedad de **F2**

**Dark (primario)** · **Light (secundario)**. Todo par texto/fondo cumple AA (§5).

| Token | Dark (primario) | Light (secundario) | Uso |
|---|---|---|---|
| `--color-bg` (canvas) | `#0b1020` | `#f8fafc` | fondo de la app |
| `--color-surface` | `#111827` | `#ffffff` | tarjetas/paneles |
| `--color-surface-elevated` | `#172033` | `#ffffff` | popovers/elevación |
| `--color-surface-muted` | `#0e1626` | `#f1f5f9` | columnas kanban/zebra |
| `--color-border` (line) | `#243041` | `#e2e8f0` | bordes/divisores |
| `--color-text` (fg) | `#f3f4f6` | `#0f172a` | texto principal |
| `--color-text-muted` | `#9ca3af` | `#475569` | texto secundario |
| `--color-text-subtle` | `#868e9c` | `#64748b` | metadatos (AA ≥4.5:1) |
| `--color-primary` / `-fg` | `#3b82f6` / `#0b1020` | `#2563eb` / `#fff` | acción/marca |

**Semánticos de estado** (`--color-{state}` = acento, `--color-{state}-bg` = fondo sutil):

| Estado | Dark acento / bg | Light acento / bg | Significado |
|---|---|---|---|
| `success` | `#34d399` / `#0e2a20` | `#059669` / `#d1fae5` | OK, CI verde |
| `merged` (green-teal) | `#2dd4bf` / `#0c2a28` | `#0d9488` / `#ccfbf1` | PR merged |
| `warning` | `#fbbf24` / `#2a1f08` | `#b45309` / `#fef3c7` | conflicto, aging medio |
| `danger` | `#f87171` / `#2a1414` | `#dc2626` / `#fee2e2` | CI roja, aging alto |
| `info` / `review` | `#60a5fa` / `#11203a` | `#2563eb` / `#dbeafe` | drift, review |
| `draft` | `#94a3b8` / `#1a2233` | `#64748b` / `#f1f5f9` | borrador |

> Tremor se alinea a estos valores (darkMode `class`) para no mantener dos paletas.

### 2.2 Tipografía (namespace `--font-*`) — propiedad de **F1**

- `--font-sans` = **Geist Sans** (UI) · `--font-mono` = **Geist Mono** (IDs, números, PR#, métricas).
- Escala **muy controlada**: **máx. 6 tamaños reales** y **máx. 3 pesos reales** (p. ej. 400/500/700).
- Mapear a `fontSize` Tailwind: `text-xs/sm/base/lg/2xl/3xl`. `tabular-nums` en métricas/tablas.
- **Bug a corregir en F1/F0:** hoy `globals.css` fuerza `system-ui` en `body` y anula la Geist.

### 2.3 Espaciado, radios, sombras — propiedad de **F3**

- **Grid 4px**. Padding de tarjeta compacto (`p-3`/`p-4`), gap de sección `gap-4`/`gap-6`,
  gap intra-grupo `gap-2`. Ritmo vertical compacto (densidad operacional).
- `--radius-sm` 6px · `--radius-md` 8px · `--radius-full`. ≤2 sombras (`--shadow-card`, `--shadow-popover`).

### 2.4 Movimiento (namespace `--motion-*`) — propiedad de **F6**

- **Invisible motion.** Duraciones `--motion-fast` 120ms · `--motion-base` 180ms. Easings
  estándar (sin spring exagerado). **Solo `transform`/`opacity`**. Todo anulado bajo
  `@media (prefers-reduced-motion: reduce)`. Librería: **Framer Motion mínimo** + transiciones CSS.

### 2.5 Breakpoints (`screens`) — propiedad de **F5**

Tailwind por defecto (`sm`640·`md`768·`lg`1024·`xl`1280·`2xl`1536). Objetivos de diseño:
**320 / 768 / 1024 / 1440**. **Mobile ≠ desktop comprimido**: móvil = operacional simplificado,
navegación rápida, focus-first.

### 2.6 z-index (`--z-*`) — propiedad de **F9**

`--z-base` 0 · `--z-sticky` 10 · `--z-drawer` 40 · `--z-popover` 50 · `--z-toast` 60.

---

## 3. Estrategia de componentes (híbrida)

| Tipo | Estrategia |
|---|---|
| **Base UI** (primitivos) | shadcn/ui (cva + `cn`) en `src/components/ui/` |
| **Charts** | Tremor (alineado a tokens, darkMode class) |
| **Domain UI** | componentes custom que consumen primitivos + tokens |
| **Motion** | Framer Motion **mínimo** (entradas/transiciones), CSS para micro |
| **Variantes** | `class-variance-authority` (cva) |

**Nomenclatura/estructura:** componentes `PascalCase.tsx`; primitivos en `ui/` (sin dominio);
hooks `useXxx` en `src/lib/hooks/`. Iconos: emoji-señal (🔴🟢⚠🕒) **siempre** con `aria-hidden`
+ equivalente textual; `lucide-react` para iconografía de UI/navegación. Copy/UX writing en
español (§5b); código/identificadores en inglés.

---

## 4. Tema: política dark-first

| Modo | Prioridad |
|---|---|
| **Dark** | **Primario** (default) |
| Light | Secundario |
| System | Permitido (respeta `prefers-color-scheme` si el usuario no eligió) |

Mecánica: `darkMode: "class"` en Tailwind; `<html class="dark">` por defecto; script inline
sin-FOUC lee `localStorage.theme` (o sistema) antes del paint; **toggle** en el header
operacional (lo entrega F2, lo ubica F9). Ningún componente usa `dark:` con valores crudos:
solo tokens.

---

## 5. Accesibilidad (piso WCAG 2.1 AA) — auditado por **F7**

- Contraste ≥ **4.5:1** texto normal, ≥ **3:1** texto grande/UI/estado de foco.
- **Foco visible** (`:focus-visible`, anillo 2px con `--color-primary`); nunca `outline:none` sin reemplazo.
- 100% teclado; orden de tabulación lógico; **Skip to content**.
- Semántica: landmarks (`nav/main/header`), `th scope`, roles ARIA en tabs/kanban, contexto
  sr-only en enlaces externos, `aria-live` en feed/refetch.
- Targets táctiles ≥ **44×44px** en móvil.

### 5b. UX writing — "operational clarity"

Técnico, directo, accionable, en español. **NO** "Oops!", "Something went wrong". **SÍ**:
"No se pudo leer `github.json`", "Snapshot stale (>15 min)", "Historian sin datos suficientes".

---

## 6. Definition of Done técnico (gate común)

```bash
pnpm exec tsc --noEmit   # 0 errores
pnpm lint                # 0 warnings/errores
pnpm test                # verde
pnpm build               # build OK
```

Más verificación manual del flanco y que **las 3 vistas cargan con datos reales** (`pnpm dev`).

### Objetivos de rendimiento (auditados por F8)

| Métrica | Objetivo |
|---|---|
| Lighthouse Performance | ≥ 90 |
| Lighthouse Accessibility | ≥ 95 |
| CLS | < 0.05 |
| INP | < 150 ms |
| First Load JS | < 180 KB |

---

## 7. Matriz de propiedad de archivos/secciones (anti-conflictos)

Cada archivo/sección tiene **un único dueño**; otros flancos **solicitan** cambios, no los editan.

`src/app/globals.css` por secciones-ancla:

```css
/* @tokens:color      (F2) */
/* @tokens:typography (F1) */
/* @tokens:spacing    (F3) */
/* @tokens:motion     (F6) */
/* @base:reset+a11y   (F7) */
```

`tailwind.config.ts` → `theme.extend` por key: `colors`+`safelist`+`darkMode`→F2 ·
`fontFamily`/`fontSize`→F1 · `spacing`/`borderRadius`/`boxShadow`→F3 ·
`keyframes`/`animation`/`transitionTimingFunction`/`transitionDuration`→F6 · `screens`→F5.

| Área / archivo | Dueño primario | Contribuyen (solo su aspecto) |
|---|---|---|
| `src/components/ui/*` (primitivos) | **F4** | F6 (motion), F7 (aria) vía PR coordinado |
| `src/app/layout.tsx` (shell) + header operacional | **F9** | F5 (responsive/mobile nav), F2 (toggle) |
| `Nav.tsx` + `MobileNav.tsx` | **F9** (F5 crea MobileNav) | — |
| Componentes de dominio (`KpiCards`,`PrCard`,`PrKanban`,`IssueTable`,`ActivityFeed`,`Sparkline`,`DriftBadge`,`AgingBadge`,`PageHeader`) | **por aspecto** | estructura→F4 · motion→F6 · aria→F7 · copy/estados→F10 · responsive→F5 |
| Estados `Loading/Empty/Error` (`ui/`) | **F10** | F4 (primitivo base), F6 (skeleton) |

> Si dos flancos necesitan el mismo archivo en la misma ola → mala partición: re-seccionar o serializar.

---

## 8. Branching e integración

- Un flanco = rama `ux/fN-<slug>` desde `main`; PRs pequeños; merge **squash** solo con gate verde.
- `main` siempre desplegable (flancos aditivos o token-scoped; sin estados intermedios rotos).
- Commits **sin trailer de IA**, autor Armando Vaquera.
