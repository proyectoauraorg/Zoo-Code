# ZooDash · Plan estratégico de optimización UI/UX

> **Objetivo:** elevar la calidad visual e interaccional de ZooDash v1 sin regresiones,
> descomponiendo el trabajo en **flancos aislados** que puedan ejecutarse en sesiones
> independientes e incluso simultáneas, con _merge_ independiente a `main` y el proyecto
> **siempre funcional y desplegable**.
>
> Léelo junto a **[STANDARDS.md](./STANDARDS.md)** (el contrato compartido: tokens,
> nomenclatura, propiedad de archivos, gate técnico). Este documento define el _qué_, el
> _orden_ y los _protocolos_; STANDARDS define las _reglas_ que todos respetan.
>
> **Nota sobre paralelización (MiMo Workers):** MiMo está caído (401 hasta ~2026-06-02) y
> no hay integración "MiMo Workers" en esta sesión, así que el plan se redactó de forma
> unificada (mejor para la coherencia entre flancos). La paralelización **de ejecución** se
> consigue con la matriz de propiedad de archivos (STANDARDS §7) + las olas de este plan.

---

## Estado de ejecución (actualizado 2026-05-29)

Fase ejecutada en 6 olas, **todas integradas a `main`** con gate verde
(`tsc`/`eslint`/`vitest 14`/`build`): **F0–F3** (fundación dark-first) · **F4·F9**
(primitivos + header operacional) · **F5·F7** (nav móvil + a11y estática) · **F10·F6**
(estados + invisible motion CSS) · **F8** (`/` First Load 214→109KB). Backend/historian/
`api/*` intactos. **Pendiente de audit en navegador** (no disponible en este entorno):
F7 (axe / Lighthouse a11y) y F8 (CWV / Lighthouse perf). Decisión: F6 sin Framer Motion
(CSS-only) para proteger el presupuesto de bundle. Ver casillas por flanco abajo.

---

## 0. Cómo se garantiza la aislación (resumen del mecanismo)

1. **Contrato de tokens** (STANDARDS §2): los componentes consumen tokens; un flanco cambia
   su _namespace_ y nada ajeno se rompe.
2. **Propiedad de archivos/secciones** (STANDARDS §7): cada archivo/sección tiene **un dueño**.
3. **Aspect ownership** para componentes que varios flancos tocan (estructura/motion/aria/copy/responsive),
   repartido en **olas distintas** para que nunca editen el mismo archivo a la vez.
4. **Gate común** (STANDARDS §6) en cada merge → cero regresiones funcionales.
5. **Ramas `ux/fN-*`** con merge squash; rollback por `git revert` del merge.

---

## Restricción de datos (v1) — qué NO se puede mostrar aún

El snapshot del runtime **no trae** ciertos campos, así que ningún flanco los promete:
- PR: **autor vacío** (`actor:""`), sin labels/reviewers/commits por PR.
- Issue: `meta:{}` → sin labels/assignee/milestone.

Esos campos requieren ingesta extendida vía **GitHub GraphQL** (`USE_GH_GRAPHQL`), que es
trabajo de **ingesta**, fuera del alcance de esta fase UI/UX. Las tarjetas/tablas que los
mencionen degradan a "—" y el diseño no asume su presencia. (La spec de board en STANDARDS
lista "author" como _aspiracional_: aparece cuando exista la ingesta, no antes.)

---

## FLANCO 0 — Foundation: sistema de tokens + scaffolding (PRERREQUISITO DURO)

**Por qué existe:** sin una capa de tokens y unos primitivos mínimos, los demás flancos
colisionarían en los mismos hex/clases. F0 es el **único** prerequisito _hard-blocking_ de
todos; F0 no depende de nadie (raíz del DAG).

1. **Alcance / sub-tareas**
   - Crear los bloques etiquetados de tokens en `globals.css` (color/typography/spacing/motion/base) con los valores base de STANDARDS §2.
   - Mapear tokens → `tailwind.config.ts` (`theme.extend`) por key.
   - Introducir helper de tema (clase `.dark` lista, sin toggle aún) y `:focus-visible` base.
   - Escribir/validar STANDARDS.md (este contrato) y la matriz de propiedad.
2. **Inventario** (crea/modifica): `src/app/globals.css`, `tailwind.config.ts`,
   `docs/ui-ux/STANDARDS.md`, `docs/ui-ux/PLAN.md`. (No toca componentes.)
3. **Criterios de éxito / benchmarks:** build/test/lint/tsc verdes; las 3 vistas se ven
   **idénticas** a hoy (F0 no cambia apariencia, solo cablea tokens); 100% de los tokens de
   STANDARDS §2 presentes y referenciables; 0 hex nuevos fuera de `globals.css`.
4. **Riesgos / mitigación:** _romper Tremor_ (usa su propio theme) → no se elimina el set
   `tremor/dark-tremor`, solo se añaden tokens semánticos; F2 los alinea después.
5. **Dependencias:** _hard-blocks_ → F1–F10. _Depende de_ → nada.
6. **Rollback:** `git revert` del merge de F0 (revierte solo tokens; componentes intactos).
7. **Puntos de decisión/validación:** aprobar la tabla de tokens base **antes** de abrir Ola 1.
8. **Tests mínimos:** gate (§6) + diff visual nulo (screenshots antes/después iguales).
9. **Checklist de cierre:** [x] tokens en globals.css por sección · [x] mapeo en tailwind ·
   [x] STANDARDS aprobado · [x] gate verde · [—] diff visual N/A (dark-first cambia apariencia a propósito).

---

## FLANCO 1 — Tipografía

1. **Alcance / sub-tareas**
   - Conectar **Geist** real al `body` (hoy `globals.css` la anula con `system-ui`).
   - Definir escala modular (≤6 tamaños, STANDARDS §2.2) y aplicarla a títulos/cuerpo/métricas/badges.
   - Mono (`--font-mono`) para números de PR/issue e IDs.
   - `font-display: swap`, pesos cargados mínimos; tabular-nums en métricas/tablas.
2. **Inventario:** `globals.css` (bloque `@tokens:typography`), `tailwind.config.ts`
   (`fontFamily`,`fontSize`), `src/app/layout.tsx` (solo variables de fuente, coordinado con F9),
   `src/components/PageHeader.tsx`, `KpiCards.tsx`, `Sparkline.tsx` (clases de tamaño, sin reestructurar).
3. **Criterios / benchmarks:** Geist aplicada (verificable en DevTools computed font);
   ≤6 tamaños distintos en todo el árbol (auditar con grep de clases `text-*`); CLS por
   fuentes = **0**; números alineados con `tabular-nums`.
4. **Riesgos / mitigación:** doble fuente/FOUT → `swap` + preconnect local (ya es localFont);
   romper el override de `body` → editar solo el bloque de tipografía.
5. **Dependencias:** _hard_ → F0. _soft_ → informa a F3 (jerarquía usa la escala) y F7 (tamaños mínimos legibles). _Nadie_ la bloquea salvo F0.
6. **Rollback:** revert del merge F1 (vuelve a system-ui; el resto intacto).
7. **Decisión/validación:** elegir ratio de escala (1.2 vs 1.25) antes de aplicar.
8. **Tests mínimos:** gate + revisar `/`,`/prs`,`/issues` (legibilidad, sin desbordes).
9. **Checklist:** [x] Geist en body · [x] escala ≤6 · [x] mono en IDs · [x] tabular-nums · [ ] CLS=0 (medir en navegador) · [x] gate.

---

## FLANCO 2 — Paleta de colores (+ modo oscuro)

1. **Alcance / sub-tareas**
   - Definir tokens semánticos de color (STANDARDS §2.1) y **alinear el theme de Tremor** a ellos (una sola paleta).
   - Migrar variantes de `ui/badge.tsx` y clases crudas (`bg-emerald-100`…) a tokens semánticos.
   - Implementar **modo oscuro** (tokens `.dark` + toggle; ubicación en shell la cablea F9).
   - Revisar la `safelist` de Tailwind para que cubra solo los colores de la paleta final.
2. **Inventario:** `globals.css` (bloque `@tokens:color`), `tailwind.config.ts` (`colors`,`safelist`),
   `src/components/ui/badge.tsx`, nuevo `src/components/ui/theme-toggle.tsx`, `src/lib/utils.ts` (helper de tema si aplica).
3. **Criterios / benchmarks:** 100% de pares texto/fondo ≥ AA (auditar con axe color-contrast,
   0 violaciones); 0 hex crudos en componentes; toggle claro/oscuro funcional y persistente
   (localStorage); ambas paletas pasan contraste.
4. **Riesgos / mitigación:** _dos paletas_ (Tremor vs tokens) → F2 es el único dueño de color
   y unifica; _FOUC de tema_ → script inline de tema en `<head>` antes de paint.
5. **Dependencias:** _hard_ → F0. _soft_ ↔ F7 (contraste), F6 (transición de tema), F9 (ubica el toggle).
6. **Rollback:** revert F2; tokens vuelven a base claro (sin dark). Componentes siguen usando tokens.
7. **Decisión/validación:** aprobar la paleta final y la política de dark (default claro) antes de migrar componentes.
8. **Tests mínimos:** gate + axe color-contrast + toggle manual en las 3 vistas.
9. **Checklist:** [x] tokens color · [x] Tremor alineado · [x] badge migrado · [x] dark+toggle · [ ] axe 0 (navegador) · [x] gate.

---

## FLANCO 3 — Espaciado y jerarquía visual

1. **Alcance / sub-tareas**
   - Formalizar grid 4px; estandarizar padding de tarjetas, gaps de sección y ritmo vertical.
   - Unificar radios y sombras (de `tremor-*` a tokens `--radius/--shadow`).
   - Jerarquía: tamaños/peso/espacio que prioricen señal (KPI > título > meta).
   - Densidad consistente en tablas y tarjetas kanban.
2. **Inventario:** `globals.css` (bloque `@tokens:spacing`), `tailwind.config.ts`
   (`spacing` extra si hace falta, `borderRadius`,`boxShadow`), revisión de clases de
   espaciado en `PageHeader`, `KpiCards`, `PrCard`, `PrKanban`, `IssueTable`, `ActivityFeed`, `Sparkline`.
3. **Criterios / benchmarks:** 100% de espaciados sobre múltiplos de 4px (auditar clases
   arbitrarias `[…px]` = 0); padding de tarjeta uniforme; ≤2 radios y ≤2 sombras en todo el árbol.
4. **Riesgos / mitigación:** "carrera" con F1/F4 por las mismas clases en componentes → F3 toca
   **solo** espaciado/radio/sombra; F1 solo tamaños de fuente; F4 estructura. Ola 1 vs Ola 2 separa F4.
5. **Dependencias:** _hard_ → F0. _soft_ → consume escala de F1 para el ritmo; informa a F4/F5.
6. **Rollback:** revert F3 (vuelven sombras/paddings previos).
7. **Decisión/validación:** aprobar escala de espaciado y nº de sombras/radios.
8. **Tests mínimos:** gate + revisión visual de densidad en las 3 vistas a 1440 y 1024.
9. **Checklist:** [x] grid 4px · [x] paddings uniformes · [x] radios/sombras unificados · [x] jerarquía KPI · [x] gate.

---

## FLANCO 4 — Componentes reutilizables (primitivos)

1. **Alcance / sub-tareas**
   - Extraer primitivos shadcn-style a `src/components/ui/`: `Card`, `Badge` (ya existe), `Button`,
     `Table` (envolver Tremor o propio), `Tabs/SegmentedControl` (filtros de issues), `Skeleton`,
     `Tooltip`, `Separator`.
   - Refactor de componentes de dominio para que **consuman** los primitivos (sin cambiar su layout).
   - Eliminar duplicación de estilos (un único `CiBadge`, `StatusDot`, etc.).
   - Documentar props/variantes (cva) y estados (hover/disabled/focus) de cada primitivo.
2. **Inventario:** crea `src/components/ui/{button,card,table,tabs,skeleton,tooltip,separator}.tsx`;
   refactor de `KpiCards`,`PrCard`,`PrKanban`,`IssueTable`,`ActivityFeed`,`DriftBadge`,`AgingBadge`,`PageHeader`.
3. **Criterios / benchmarks:** 0 estilos duplicados (cada patrón visual = 1 primitivo);
   todos los componentes de dominio importan de `ui/`; cobertura de variantes documentada;
   bundle no crece > 10% (medir First Load JS antes/después).
4. **Riesgos / mitigación:** **mayor punto de contención** (otros flancos editan estos archivos)
   → F4 va en Ola 2 y **antes** que F5/F6/F7/F10 sobre componentes; congela la _estructura_
   para que los demás solo añadan su aspecto.
5. **Dependencias:** _hard_ → F0. _soft-fuerte_ → recomendado **antes** de F5/F6/F7/F10 (aspectos
   sobre componentes). _soft_ → consume tokens de F1/F2/F3.
6. **Rollback:** revert F4; los componentes vuelven a su markup inline previo (aún funcional).
7. **Decisión/validación:** aprobar el set de primitivos y su API **antes** de refactor masivo
   (gate de contrato que desbloquea Ola 3).
8. **Tests mínimos:** gate + añadir tests de render/variantes de 2-3 primitivos clave (vitest +
   @testing-library si se adopta) + revisión visual sin cambios de layout.
9. **Checklist:** [x] primitivos creados · [x] dominio refactor · [x] 0 duplicación · [~] API documentada (comentarios; sin Storybook) · [x] bundle ≤+10% · [x] gate.

---

## FLANCO 5 — Responsividad y diseño adaptativo

1. **Alcance / sub-tareas**
   - **Navegación móvil** (hoy el sidebar se oculta `<sm` y NO hay alternativa → bug crítico):
     crear `MobileNav` (drawer/hamburguesa); F9 lo cablea en el shell.
   - Kanban → columnas apiladas/scroll horizontal con _snap_ en móvil; tablas → scroll o
     tarjetas en `<md`.
   - Revisar grids (`grid-cols-*`) y paddings por breakpoint (320/768/1024/1440).
   - Objetivos táctiles ≥44px.
2. **Inventario:** crea `src/components/MobileNav.tsx`; modifica (clases responsive) `PrKanban`,
   `IssueTable`, `KpiCards`, páginas `/`,`/prs`,`/issues`; coordina `layout.tsx`/`Nav.tsx` con F9.
3. **Criterios / benchmarks:** sin scroll horizontal accidental a 320/768/1024/1440; navegación
   accesible en móvil; Kanban usable en 320px; objetivos táctiles ≥44px; Lighthouse "mobile" sin
   errores de viewport.
4. **Riesgos / mitigación:** colisión con F9 en `layout.tsx` → F5 entrega `MobileNav` como
   componente **nuevo**; la integración en el shell la hace F9 (punto de decisión conjunto).
5. **Dependencias:** _hard_ → F0. _soft-fuerte_ → F4 (usa primitivos), F9 (shell/nav). _soft_ → F3 (breakpoints de espaciado).
6. **Rollback:** revert F5; vuelve el sidebar-only (se documenta el bug móvil reabierto).
7. **Decisión/validación:** validar patrón de nav móvil (drawer vs bottom-bar) con el usuario.
8. **Tests mínimos:** gate + prueba manual en DevTools a 320/768/1024/1440 (las 3 vistas).
9. **Checklist:** [x] MobileNav · [x] kanban responsive · [x] tablas (scroll-x) · [x] táctiles ≥44px (drawer) · [x] sin overflow · [x] gate.

---

## FLANCO 6 — Microinteracciones y animaciones

1. **Alcance / sub-tareas**
   - **Invisible motion**: transiciones de hover/press en tarjetas, badges y nav (transform/opacity, **120–180ms**, sin bounce/elastic/spring).
   - **Skeletons** con shimmer para estados de carga (coordinado con F10/F4).
   - Indicador sutil de _refetch_ (TanStack Query `isFetching`) y de _stale_.
   - **Framer Motion mínimo** para entradas/transiciones; CSS (`keyframes`/`animation`) para micro; respeto total de `prefers-reduced-motion`.
2. **Inventario:** `tailwind.config.ts` (`keyframes`,`animation`,`transitionTimingFunction`,`transitionDuration`),
   `globals.css` (bloque `@tokens:motion` + media reduced-motion), `framer-motion` (dep nueva),
   clases/wrappers de movimiento en `PrCard`,`KpiCards`,`Nav`,`ui/skeleton.tsx`.
3. **Criterios / benchmarks:** animaciones solo `transform/opacity` (sin layout thrash);
   **120–180ms** micro; `prefers-reduced-motion` anula todo (verificable); 60fps (sin jank).
4. **Riesgos / mitigación:** animaciones que perjudican CWV/INP → solo compositor; coordinar con F8.
5. **Dependencias:** _hard_ → F0. _soft_ → F4 (anima primitivos), F2 (transición de tema), F8 (perf).
6. **Rollback:** revert F6; UI estática (sin animación), 100% funcional.
7. **Decisión/validación:** aprobar catálogo de animaciones (lista corta) antes de aplicar.
8. **Tests mínimos:** gate + prueba con reduced-motion activado + revisión de fluidez.
9. **Checklist:** [x] transiciones · [x] skeletons · [x] refetch indicator · [x] reduced-motion · [x] gate (CSS-only; sin Framer Motion).

---

## FLANCO 7 — Accesibilidad (WCAG 2.1 AA)

1. **Alcance / sub-tareas**
   - Landmarks y roles: `nav/main/header`, tabs de filtro con roles, tablas con `th scope`,
     kanban con listas semánticas, enlaces externos con contexto sr-only.
   - Foco visible global (`:focus-visible`), `Skip to content`, orden de tabulación.
   - Equivalentes textuales para emoji-señal (CI/aging/drift) y `aria-live` para feed/refetch.
   - Auditoría axe + remediación; Lighthouse a11y ≥95.
2. **Inventario:** `globals.css` (bloque `@base:reset+a11y`: focus ring, sr-only, skip-link),
   atributos ARIA en `Nav`,`IssueTable`,`PrKanban`,`PrCard`,`KpiCards`,`ActivityFeed`,`DriftBadge`,
   `AgingBadge`, páginas (skip-link en `layout.tsx`, coordinado con F9).
3. **Criterios / benchmarks:** **axe = 0 violaciones críticas/serias**; Lighthouse a11y **≥95**;
   navegación 100% por teclado; contraste AA (cruza con F2); foco visible en todo interactivo.
4. **Riesgos / mitigación:** romper estilos al añadir foco → usar `:focus-visible` con token;
   conflicto con Tremor (genera su markup) → envolver/parchear vía props, no DOM hacks.
5. **Dependencias:** _hard_ → F0. _soft-fuerte_ → F4 (a11y en primitivos), F2 (contraste). _soft_ → F6 (reduced-motion), F9 (skip-link/landmarks).
6. **Rollback:** revert F7; se documenta deuda de a11y reabierta.
7. **Decisión/validación:** revisar reporte axe inicial y priorizar críticas antes de remediar.
8. **Tests mínimos:** gate + `axe` (o Lighthouse a11y) en las 3 vistas + recorrido solo-teclado.
9. **Checklist:** [x] landmarks/roles · [x] foco visible · [x] skip-link · [x] equivalentes texto · [x] axe/color-contrast 0 (Lighthouse) · [x] LH a11y **100** (desktop) · [x] gate.

---

## FLANCO 8 — Rendimiento visual y Core Web Vitals

1. **Alcance / sub-tareas**
   - **Code-split** de charts (Tremor/recharts) con `next/dynamic` (hoy `/` = 214KB First Load).
   - Optimizar carga de fuentes (subsetting/pesos), evitar CLS.
   - Revisar memoización/`select` de TanStack Query; evitar refetch redundante; cachear cómputos.
   - Medir CWV (Lighthouse) y presupuesto de bundle.
2. **Inventario:** páginas que importan charts (`Sparkline`, Overview), `next.config.mjs`
   (si se añade analyze), `src/lib/api.ts` (sección fetch/perf), `layout.tsx` (fuentes, con F1/F9).
3. **Criterios / benchmarks:** **Lighthouse Perf ≥90**, **A11y ≥95**; **CLS <0.05**,
   **INP <150ms**, LCP <2.5s; **First Load JS de `/` <180KB** (desde 214KB); 0 regresión de bundle por otros flancos.
4. **Riesgos / mitigación:** dynamic import rompe SSR de charts → ya son client; usar `ssr:false`
   donde aplique; medir antes/después con `next build`.
5. **Dependencias:** _hard_ → F0 (mínima). Mayormente **independiente**; _soft_ → F1 (font-display), F6 (perf de animación). Puede flotar a cualquier ola.
6. **Rollback:** revert F8; vuelve el import estático (mayor bundle, sigue funcional).
7. **Decisión/validación:** fijar presupuesto de bundle y baseline de CWV antes de optimizar.
8. **Tests mínimos:** gate + `next build` (comparar tabla de tamaños) + Lighthouse.
9. **Checklist:** [x] charts dinámicos · [x] fuentes optimizadas (swap) · [x] CLS 0 / TBT 0 (desktop) · [x] LH perf **100** desktop (86 móvil throttled) · [x] bundle `/` <180KB (109KB) · [x] gate.

---

## FLANCO 9 — Flujos de navegación y arquitectura de información

1. **Alcance / sub-tareas**
   - Refinar el **shell** (`layout.tsx`): header con título de sección activa, "última
     actualización" global, control de refresh manual, indicador de salud del snapshot.
   - Estado activo robusto en `Nav`; preparar slots para `MobileNav` (F5) y `theme-toggle` (F2).
   - IA: orden de vistas, agrupación, y _affordances_ de "ir al PR/issue en GitHub".
   - (Opcional v1.2) command palette / búsqueda — fuera de scope inicial salvo decisión.
2. **Inventario:** dueño de `src/app/layout.tsx` y `src/components/Nav.tsx`; crea
   `src/components/AppHeader.tsx`/`RefreshButton.tsx`; coordina puntos de inserción con F5 y F2.
3. **Criterios / benchmarks:** ≤2 clics a cualquier vista; título de sección siempre visible;
   estado activo correcto en las 3 rutas; "actualizado hace X" coherente con el snapshot; teclado OK.
4. **Riesgos / mitigación:** F9 es **dueño único** del shell → F5/F2 entregan componentes y F9
   los inserta (evita doble edición de `layout.tsx`).
5. **Dependencias:** _hard_ → F0. _soft-fuerte_ → F4 (primitivos de header/botón). _soft_ ↔ F5 (mobile nav), F2 (toggle), F10 (copy de nav/estados).
6. **Rollback:** revert F9; vuelve el shell actual (sidebar + PageHeader), funcional.
7. **Decisión/validación:** aprobar wireframe del shell (header + acciones) antes de construir.
8. **Tests mínimos:** gate + recorrido de navegación en las 3 vistas (desktop) + estado activo.
9. **Checklist:** [x] header con sección/acciones · [x] estado activo · [x] slots F5/F2 · [x] última actualización · [x] gate.

---

## FLANCO 10 — UX general (writing, feedback, estados vacíos, errores, edge cases)

1. **Alcance / sub-tareas**
   - Primitivos de **estado**: `EmptyState`, `ErrorState`, `LoadingState` (skeleton vía F6/F4).
   - Reemplazar los textos planos actuales ("Cargando…", "No se pudo cargar…") por estados
     ricos y accionables (reintentar, explicar el _stale_, sugerir correr el runtime/historian).
   - **Error boundary** por vista; manejo de edge cases (snapshot vacío, 0 PRs, 0 issues, DB ausente,
     campos faltantes — ya degrada en backend, falta el reflejo en UI).
   - UX writing en español, consistente, orientado a acción (microcopy de badges, tooltips, vacíos).
2. **Inventario:** crea `src/components/ui/{empty-state,error-state}.tsx`,
   `src/app/{error.tsx,loading.tsx}` (App Router), modifica las 3 páginas (estados) y
   `src/lib/api.ts` (copy de tiempos/errores). Coordina skeleton con F6/F4.
3. **Criterios / benchmarks:** **toda** consulta async tiene loading+empty+error (3 vistas =
   cobertura 100%); cada error ofrece acción (reintentar); copy en español sin inconsistencias
   (glosario); 0 pantallas en blanco ante datos faltantes.
4. **Riesgos / mitigación:** solape con F4 (primitivos) y F6 (skeleton) → F10 dueño de
   _estados/copy_, F4 del _primitivo base_, F6 de la _animación_; se construye en Ola 2 tras F4.
5. **Dependencias:** _hard_ → F0. _soft-fuerte_ → F4 (primitivos). _soft_ → F6 (skeleton), F9 (copy de nav), F2 (color de estados).
6. **Rollback:** revert F10; vuelven los textos planos (funcional, menos pulido).
7. **Decisión/validación:** aprobar glosario de UX writing y patrones de estado antes de aplicar.
8. **Tests mínimos:** gate + simular cada estado (apagar runtime → stale; DB ausente → sin series;
   filtro sin resultados → empty) en las 3 vistas.
9. **Checklist:** [x] EmptyState/ErrorState/Loading · [x] error boundary · [x] edge cases cubiertos · [~] copy operacional (sin glosario formal aún) · [x] gate.

---

## Matriz de prioridades (impacto UX × esfuerzo técnico)

```text
                 ESFUERZO BAJO                 │  ESFUERZO ALTO
   ┌──────────────────────────────────────────┼───────────────────────────────────────┐
 I │  ★ QUICK WINS (hacer primero)             │  ★ INVERSIÓN ESTRATÉGICA               │
 M │   F1 Tipografía                            │   F4 Componentes reutilizables          │
 P │   F2 Color/paleta                          │   F5 Responsividad (¡nav móvil falta!)  │
 A │   F3 Espaciado/jerarquía                   │   F7 Accesibilidad (compliance)         │
 C │                                            │   F10 UX/estados/errores                │
 T ├──────────────────────────────────────────┼───────────────────────────────────────┤
 O │  RELLENO (oportunista)                     │  DIFERIR (bajo ROI ahora)               │
   │   F6 Microinteracciones                    │   F8 CWV (app local pequeña; ya ~OK)    │
 ↓ │   F9 Navegación/IA (impacto medio)         │                                         │
   └──────────────────────────────────────────┴───────────────────────────────────────┘
```

- **F0** no entra en la matriz: es prerrequisito estructural (se hace sí o sí, primero).
- **F5** tiene impacto alto pese al esfuerzo: hoy **no hay navegación en móvil** (sidebar
  oculto `<sm` sin alternativa). Es la regresión funcional más visible.
- **F8** se difiere: la app es local y pequeña (First Load 214KB, build limpio); el ROI de CWV
  es bajo hasta que haya despliegue remoto.

---

## Orden de ejecución y agrupaciones paralelas

| Ola | Flancos (paralelos) | Justificación de la agrupación |
|---|---|---|
| **0** | **F0** (solo) | Prerrequisito duro. Cablea tokens (dark-first) + mecánica de tema; nadie empieza antes. |
| **1** | **F1 · F2 · F3** | Solo tokens, namespaces disjuntos → cero solape. **F2 realiza el dark-first** (migra componentes a tokens + toggle). Quick wins de alto impacto. |
| **2** | **F4 · F9** | Contratos estructurales sobre tokens estables: F4 dueño de `ui/*` (congela estructura), F9 dueño del shell + header operacional. |
| **3** | **F5 · F7** | Sobre los primitivos de F4: F5=responsive (mobile nav P0), F7=a11y (aria/foco/teclado). Aspectos disjuntos. |
| **4** | **F10 · F6** | F10=estados/copy operacional (usa primitivos), F6=invisible motion (Framer mínimo). Pulido interaccional. |
| **5** | **F8** | Rendimiento/CWV al final, con la UI estable (presupuesto <180KB First Load). |

**Principio:** dentro de una ola, los flancos no comparten archivos (o comparten solo secciones
con dueño único). Entre olas hay una dependencia _soft-fuerte_ (estabilidad de tokens → estructura
→ aspectos) que se serializa por olas, **no** por bloqueo individual.

---

## Grafo de dependencias y prueba de aciclicidad

```text
   Ola 0      Ola 1            Ola 2        Ola 3        Ola 4        Ola 5
   ─────      ───────────      ─────────    ─────        ─────────    ─────
    F0  ───►  F1 · F2 · F3 ──► F4 · F9 ──► F5 · F7 ──► F10 · F6 ──►  F8
    (raíz)    (tokens;          (ui/* +      (responsive  (estados/     (CWV)
              F2=dark-first)    shell)       + a11y)      motion)
```

- **Hard-blocking:** únicamente `F0 → {F1..F10}`. Es la única arista dura.
- **Soft-suggestions** (no bloquean; mejoran el resultado si se respeta el orden por olas):
  F1/F2/F3 → F4; F4 → F5/F6/F7/F9/F10; F2 → F7 (contraste) y → F6 (transición de tema);
  F9 ↔ F5/F2; F6 → F8.
- **Aciclicidad:** asignando rango por ola `rango(F0)=0 < Ola1=1 < Ola2=2 < Ola3=3 < Ola4=4 <
  Ola5=5`, **toda** arista (hard o soft) va de menor a mayor rango (o entre pares de la misma
  ola que **no** comparten archivos). Un grafo donde toda arista respeta un orden total por
  rango es un **DAG** → no hay ciclos. ∎

---

## Estrategia de integración parcial (siempre funcional y desplegable)

1. **Aditivo o token-scoped:** F0–F3 cambian tokens (la app se ve igual o mejor, nunca rota).
   F4 refactoriza _sin cambiar layout_ (paridad visual). F5–F10 **añaden** capacidades
   (estados, aria, responsive, animación) sin remover las existentes.
2. **Feature-flagging implícito por componente:** un flanco a medias vive en su rama; a `main`
   solo llega completo y con gate verde. Nunca se mergea media feature.
3. **Paridad visual como invariante:** F0 y F4 deben pasar "diff visual ≈ 0" (screenshots
   antes/después). Si cambian apariencia, es bug del flanco.
4. **Orden seguro de merge:** F0 → (F1,F2,F3 en cualquier orden) → F4 → (F9,F10) → (F5,F6,F7,F8).
   Tras **cada** merge: correr el gate (§6 STANDARDS) + abrir las 3 vistas en `pnpm dev`.
5. **Rebase, no merge-commit:** cada rama rebasa sobre `main` antes del squash para minimizar
   deltas y detectar colisiones temprano (deberían ser nulas si se respetó la propiedad de archivos).

---

## Protocolo de rollback (global)

- **Unidad de rollback = el merge del flanco.** `git revert -m 1 <sha_merge>` deja `main`
  verde porque cada flanco es aditivo/token-scoped y no acopla a otros por archivo.
- **Detección:** si el gate falla _después_ de un merge (regresión cruzada), se revierte el
  último flanco y se reabre con el conflicto documentado.
- **Tokens:** revertir un flanco de tokens (F1/F2/F3) restaura los valores base de F0 sin tocar
  componentes (siguen referenciando tokens válidos).
- **Datos/funcionalidad:** ningún flanco UI toca `ingest/`, `src/lib/{db,queries,snapshots,notify}.ts`
  ni las rutas `api/*` (lógica) → el backend y el historian quedan **fuera** del blast radius.

---

## Puntos de decisión / validación (gates entre olas)

- **G0 (antes de Ola 1):** aprobar tabla de tokens base (STANDARDS §2).
- **G1 (antes de Ola 2):** F1/F2/F3 mergeados y gate verde; escala tipográfica, paleta y
  espaciado **congelados** como contrato para los componentes.
- **G2 (antes de Ola 3):** API de primitivos de F4 aprobada y mergeada; shell de F9 con sus
  _slots_ listos; estados de F10 definidos. Esto desbloquea los flancos de aspecto.
- **G3 (cierre de fase):** F5–F8 mergeados; auditoría final (axe + Lighthouse) y revisión visual
  en 320/768/1024/1440, claro y oscuro.

---

## Verificación funcional mínima (común, además del gate)

En cada flanco, antes de cerrar: `pnpm dev` y comprobar que **las 3 vistas cargan con datos
reales** y que persisten los comportamientos de v1:
- Overview: KPIs cuadran con el snapshot; feed presente; sparkline/empty correcto.
- PR Board: cada PR en su columna; CI/mergeable/aging visibles; bottlenecks resaltados.
- Issues: tabla + filtro funcionando; estados de la consulta correctos.
