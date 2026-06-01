# ZooDash v2 — Fichas de funcionalidades

> Plano. No implementado. Cada ficha: alcance · datos · API · UI · dependencias · riesgos ·
> pruebas · aceptación · "para no-técnicos". Tiempo real (SSE) está en [ARCHITECTURE.md](./ARCHITECTURE.md);
> aquí cada vista indica qué `queryKey` invalida ante un evento `changed`.

---

## F-A · Contributor Analytics (`/contributors`)

**Para no-técnicos:** quién mueve el proyecto (abre/mergea PRs, revisa), cuánto tarda un PR
de abierto a mergeado, y si hay alguien sobrecargado de revisiones o un cuello de botella.

1. **Alcance / sub-tareas**
   - Ingesta **GraphQL** (`gh api graphql`): por PR → `author`, `reviewRequests`, `reviews`
     (state, submittedAt, comments), `commits` (author, additions/deletions), `labels`.
   - Proyectar a `contributor`, `pr_reviewer`, `code_review`, `commit`; rollup diario a
     `contributor_metric_daily`.
   - Métricas: PRs abiertos/mergeados por persona; **cycle-time** (p50/p90 de
     `merged_at-created_at`); **carga de revisión** (reviews por reviewer); **latencia de
     revisión** (1ª review − apertura); balance (Gini/relación max:min de carga).
   - Vista: leaderboard + distribución de cycle-time + heatmap de carga de revisión + serie.
2. **Datos:** GraphQL (enricher) → tablas §2/§3 de DATA_MODEL_v2. Backfill desde histórico.
3. **API:** `GET /api/contributors` → `{ contributors: [{login, role, prsOpened, prsMerged,
   reviews, avgReviewLatencyH, cycleTimeP50H, cycleTimeP90H}], reviewLoad: [...], series: [...] }`.
   Tipado en `src/lib/types.ts`. Lectura vía `ContributorRepo` (driver postgres).
4. **UI:** `src/app/contributors/page.tsx` (client + TanStack Query) + componentes
   `ContributorTable`, `CycleTimeChart` (Tremor, dynamic import), `ReviewLoadHeatmap`. Reusa
   tokens/primitivos v1 (`Card`, `Table`, `Badge`). Realtime: invalida `["contributors"]`.
5. **Dependencias:** _hard_ → V2.0 (motor PG). _soft_ → V2.1 (realtime), enricher GraphQL.
6. **Riesgos / mitigación:** rate-limit GraphQL → batching + `updatedAt` incremental + caché;
   identidad GitHub↔Discord incierta → `contributor.discord_id` opcional, no se infiere a ciegas;
   bots inflan métricas → `role='bot'` excluible por filtro.
7. **Pruebas:** unit (mappers GraphQL, cálculo cycle-time/percentiles/Gini con fixtures);
   integración (enricher→PG con respuestas GraphQL grabadas); contract (zod del JSON GraphQL);
   e2e (vista carga, filtra bots). Simulación: dataset sintético de PRs+reviews (ver TESTING).
8. **Aceptación:** cycle-time y carga coinciden con un cálculo manual sobre el fixture; la vista
   degrada si faltan datos (sin GraphQL → muestra solo lo que el snapshot trae); a11y AA; gate verde.

---

## F-D · Discord Panel (`/discord`)

**Para no-técnicos:** pulso de la comunidad en Discord — qué canales y personas están activos
y cuándo — usando lo que el runtime ya recoge. **No se espía nada**; son los datos que ya entran.

1. **Alcance / sub-tareas**
   - Historizar `snapshots/discord.json` (que el runtime emite desde `.context_inbox/discord.txt`)
     a la hypertable `discord_activity` (ya prevista en v1.5).
   - Métricas: mensajes por canal/usuario, actividad por hora/día, frescura del intake
     ("hace cuánto entró el último dato"), top canales/usuarios.
   - Vista: serie temporal + top-N canales/usuarios + estado de frescura del intake.
2. **Datos:** `DISCORD_SNAPSHOT` (env, ya existe) → projector/historian → `discord_activity`.
   **Sin scraping** (gobernanza); si el intake está vacío, la vista lo dice ("usa `make
   context-discord`").
3. **API:** `GET /api/discord` → `{ fresh: bool, lastIntake: iso, byChannel: [...],
   byUser: [...], series: [{ts, count}] }`.
4. **UI:** `src/app/discord/page.tsx` + `DiscordActivityChart`, `TopList`. EmptyState claro
   cuando no hay intake. Realtime: invalida `["discord"]` (baja frecuencia; puede seguir con poll).
5. **Dependencias:** _hard_ → V2.0. Independiente del resto. **Datos ya existen** → bajo esfuerzo.
6. **Riesgos / mitigación:** formato de `discord.txt`/`discord.json` variable → parser tolerante
   (Zod + defaults, como v1); PII → mostrar solo handles ya presentes, sin enriquecer.
7. **Pruebas:** unit (parser de discord.json con fixtures, agregaciones); e2e (vista + empty
   state sin intake). Simulación: generador de líneas `discord.txt` sintéticas (ver TESTING).
8. **Aceptación:** agregados cuadran con el fixture; empty/stale states correctos; a11y AA; gate verde.

---

## F-C · Merge Conflict Tracker (`/conflicts`)

**Para no-técnicos:** qué PRs chocan con la rama principal, **qué archivos** causan el choque,
**desde cuándo** llevan así, y qué archivos son "zonas calientes" que rompen una y otra vez.

1. **Alcance / sub-tareas**
   - Detección de estado: `mergeable=CONFLICTING` a lo largo del tiempo (ya en el snapshot) →
     ciclo de vida en `conflict` (detected_at/resolved_at).
   - Archivos en conflicto: `git merge-tree <base> <head>` sobre un **clon read-only dedicado**
     (mirror en `~/.cache/zoodash/repo.git`, **no** el fork de trabajo) → `conflict_file`.
   - Métricas: nº de conflictos abiertos, **duración** (now−detected_at), **hotspots** (archivos
     que más reaparecen), correlación con aging/CI.
   - Vista: lista de conflictos con duración + tabla de hotspots + (opcional) timeline.
2. **Datos:** `pr` (mergeable) + `git merge-tree` (enricher de conflictos) → `conflict`,
   `conflict_file`. El clon se actualiza con `git fetch` read-only.
3. **API:** `GET /api/conflicts` → `{ open: [{prNumber, title, detectedAt, openForH, files:[...]}],
   hotspots: [{path, times}] }`.
4. **UI:** `src/app/conflicts/page.tsx` + `ConflictList`, `HotspotTable`. Badges de duración
   (reusa estilo aging). Realtime: invalida `["conflicts"]`.
5. **Dependencias:** _hard_ → V2.0. _soft_ → clon read-only + `git` disponible (lo está).
6. **Riesgos / mitigación:** `merge-tree` requiere refs locales → mantener el mirror al día
   (fetch); coste de cómputo → solo recalcular para PRs con `mergeable=CONFLICTING`; **nunca**
   escribir en el clon ni en el fork (solo `fetch`/`merge-tree`, ambos read-only).
7. **Pruebas:** unit (parser de salida de `merge-tree`, cálculo de duración/hotspots);
   integración (repo git de prueba con conflicto sembrado → archivos detectados); e2e (vista).
   Simulación: repos git temporales con conflictos controlados (ver TESTING).
8. **Aceptación:** archivos en conflicto detectados == los sembrados en el repo de prueba;
   duración correcta; el fork de trabajo **no** se modifica (verificado por `git status`); gate verde.

---

## F-K · Command Palette (Cmd-K)

**Para no-técnicos:** una barra que sale con ⌘K para **saltar a cualquier PR, issue o persona**
o **ejecutar acciones** (refrescar, cambiar tema, abrir en GitHub) tecleando, sin ratón.

1. **Alcance / sub-tareas**
   - `cmdk` (headless, accesible) estilizado con tokens v1. Atajo `⌘K`/`Ctrl-K`, foco-trap,
     navegación por teclado, grupos (Navegación · PRs · Issues · Contributors · Acciones).
   - Fuente de datos: `GET /api/search?q=` (busca en proyecciones: PRs/issues/contributors) +
     comandos locales (rutas, tema, refresh, abrir upstream).
   - Ranking difuso (match por número/título/login), debounce, top-N.
2. **Datos:** `/api/search` (lee PG; en v1 podría leer snapshot/SQLite → **se puede adelantar
   como v1.x**). 
3. **API:** `GET /api/search?q=foo&limit=20` → `{ prs:[...], issues:[...], contributors:[...] }`.
4. **UI:** `src/components/CommandPalette.tsx` (client, montado en layout); hook `useHotkey`.
   Acciones reusan `queryClient.invalidateQueries`, `ThemeToggle`, `next/navigation`.
5. **Dependencias:** **ninguna dura** (client-side). _soft_ → `/api/search` (o lee lo de v1).
   Añade dependencia `cmdk` (~pequeña).
6. **Riesgos / mitigación:** colisión de atajo con el navegador (⌘K) → `preventDefault` y solo
   cuando el foco no esté en un input; bundle → `cmdk` es ligero y la paleta se puede `dynamic`.
7. **Pruebas:** unit (ranking difuso, parser de query); a11y (rol `dialog`, foco-trap, teclado);
   e2e (abrir con ⌘K, buscar PR #, navegar). Simulación: no requiere infra.
8. **Aceptación:** ⌘K abre/cierra; teclado completo; navega a PR/issue/contributor; acciones
   funcionan; axe 0; gate verde.

---

## Flags de feature (rollout incremental)

`FEATURE_CONTRIBUTORS`, `FEATURE_DISCORD`, `FEATURE_CONFLICTS`, `FEATURE_PALETTE`,
`REALTIME_SSE`, `DB_DRIVER=postgres|sqlite`. Cada vista se enciende por flag → `main` siempre
desplegable; rollback = apagar el flag.
