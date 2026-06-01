# ZooDash v3 — Predictive Conflict — Dossier de preparación (NO implementar aún)

> **Estado:** diseño/preparación. Nada de esto está construido. Es el plano técnico
> de v3 para ejecutarlo cuando se apruebe. Hereda identidad y contrato visual de v1
> (ver [../ui-ux/STANDARDS.md](../ui-ux/STANDARDS.md)), la infraestructura de v2
> (event store, replay, mirror, heat graph) y la gobernanza innegociable del entorno.
>
> **➡ Empieza por [REVIEW_V2H_V2I.md](./REVIEW_V2H_V2I.md):** la pasada de revisión
> archivo-por-archivo de V2.h/V2.i fija los **prerrequisitos P1–P6** que v3 debe saldar
> en su Fase 0 (el mirror de V2.i hoy no entrega datos reales en producción — y v3 los
> necesita como insumo primario).

## Índice

| Doc | Qué contiene |
|---|---|
| **README.md** (este) | Resumen no-técnico y técnico, alcance, fases, matriz, ADRs, gobernanza |
| **[REVIEW_V2H_V2I.md](./REVIEW_V2H_V2I.md)** | **Auditoría del código V2.h/V2.i** → 14 hallazgos + prerrequisitos P1–P6 |
| [PREDICTIVE_CONFLICT_SPEC.md](./PREDICTIVE_CONFLICT_SPEC.md) | Spec completa: collector, overlap engine, modelo de probabilidad, confirmación, alerting, endpoint, vista, ADRs, migración, aceptación, riesgos |
| [DATA_MODEL_v3.sql](./DATA_MODEL_v3.sql) | Tablas nuevas: `pr_changed_file`, `pr_changed_hunk`, `conflict_prediction` |
| [TESTING_AND_SIMULATION.md](./TESTING_AND_SIMULATION.md) | Pirámide de pruebas + **arnés de simulación/backtest** (precision/recall/lead-time) |

---

## 1. Para no-técnicos (en una página)

**El problema.** GitHub solo te avisa de un choque (`CONFLICTING`) **después** de que
ya existe, y solo de cada PR contra la rama principal. Nunca te dice *"el PR de Ana y el
de Beto van a chocar entre sí"*. Para cuando aparece la etiqueta roja, el trabajo
duplicado ya está hecho y alguien tendrá que rehacerlo.

**Qué añade v3.** ZooDash mira los archivos (y las líneas) que toca **cada PR abierto** y
detecta **solapamientos antes de que GitHub marque el conflicto**:

1. **PR ↔ PR** — *"estos dos PRs tocan los mismos archivos; si uno se mergea, el otro
   chocará"*. Aviso temprano para coordinar quién va primero.
2. **PR ↔ rama base** — *"este PR quedó atrás respecto a `main` justo en los archivos que
   modifica; pronto será CONFLICTING"*. Adelanta el recálculo periódico de GitHub.

Cada predicción trae una **probabilidad** (baja/media/alta/crítica) y los **archivos
compartidos**, reusando el "mapa de zonas calientes" que v2 ya construyó: si el choque
cae en una zona históricamente conflictiva, sube de prioridad.

**Cómo sabemos que sirve.** No lo afirmamos: lo **medimos**. Un *backtest* reproduce el
historial y comprueba cuántos conflictos reales habríamos anticipado y **con cuánta
antelación** (lead-time). Esa cifra —"predijimos el N% de los conflictos, una mediana de
X horas antes"— es el criterio de éxito.

**Riesgo y costo.** Bajo en piezas nuevas: v3 **reusa** el clon read-only y el motor de
v2; no añade servicios. El costo real es **arreglar primero** la tubería de archivos de
v2 (que hoy no trae datos reales — ver la revisión) y **calibrar** el modelo para no
generar falsos positivos molestos. Por eso v3 va por fases y la calibración es una fase
explícita con métricas.

---

## 2. Para técnicos (resumen ejecutivo)

v3 es una **capa predictiva** sobre la infraestructura de v2. No cambia el motor; añade
un *collector* de archivos por rama y un *projector* de solapamiento:

```
PRs abiertos (pr_snapshot, state=OPEN, !draft)
   │
   ├─ collector (Python, reusa mirror read-only de V2.i — CORREGIDO P1/P2):
   │     para cada PR: merge-base(main, head) + `git diff --name-only base..head`
   │     (+ `git diff -U0` para hunks)  →  pr_changed_file (+ pr_changed_hunk)
   │
   ├─ projector (TS): overlap pairwise sobre PRs abiertos
   │     files(A)∩files(B), Jaccard, hunk-overlap, zone prior (← conflict_heat de V2.i)
   │     →  conflict_prediction  (DELETE+INSERT idempotente, patrón age_risk)
   │
   ├─ confirmación (opcional, top-K): `git merge-tree --write-tree headA headB`
   │     (read-only) → eleva "predicted" a "latent-confirmed"
   │
   ├─ alerting: regla nueva `predicted_conflict` → alert + decision_log (V2.h)
   │
   └─ endpoint GET /api/predictions  (+ /api/conflicts amplía "predicted")
         → vista: matriz PR×PR / lista priorizada + KPI de lead-time
```

**Decisiones clave (detalle en spec §ADRs):**

- **Diff por PR + intersección de conjuntos (O(P))**, no merge-tree pairwise (O(P²)).
  Calculamos el conjunto de archivos de cada rama una vez y cruzamos en memoria; solo
  los pares de mayor score se *confirman* con un merge-tree real. (ADR-V3-1)
- **Modelo rule-based, explicable, ponderado** — misma filosofía que la pressure
  function y el age-risk de v2. Sin ML al inicio; ML diferido hasta tener datos
  etiquetados del backtest. (ADR-V3-2)
- **Predicciones = read model materializado, NO event-sourced** — declarado
  explícitamente (corrige la grieta de V2.i, ver review F-3). Determinismo garantizado
  como **función pura del input** (snapshot de archivos + heat), no por replay de
  `event_log`. (ADR-V3-3)
- **Reusa el mirror y el `conflict_heat` de V2.i** — no se reconstruye infraestructura.
  El mirror se **arregla** (refspec de PRs) en Fase 0. (ADR-V3-4/V3-5)
- **Degrade graceful** sin git o sin hunks: file-level sigue funcionando; sin git,
  predicciones vacías y la UI lo dice. (ADR-V3-6)

---

## 3. Alcance v3 y fases

| Fase | Entrega | Depende de |
|---|---|---|
| **v3.0 — Fundación de datos** | Arreglar mirror (refspec PR refs, P1), collector `git diff --name-only` por PR → `pr_changed_file`, reconciliación por ciclo (P4), `collectorStatus` (P5), tests que corren (P6) | Review P1–P6 |
| **v3.1 — Overlap engine** | Projector pairwise → `conflict_prediction` (file overlap + Jaccard + zone prior desde `conflict_heat`), niveles low/med/high/critical | v3.0 |
| **v3.2 — Precisión de hunks** | `pr_changed_hunk` (`git diff -U0`), overlap a nivel de línea, confirmación opcional vía `git merge-tree --write-tree` top-K | v3.1 |
| **v3.3 — Superficie de usuario** | Regla `predicted_conflict` (alerting + decision_log), `GET /api/predictions`, vista (matriz PR×PR / lista priorizada) | v3.1 |
| **v3.4 — Validación & calibración** | Arnés de simulación sintética + backtest histórico best-effort → precision/recall/F1 + lead-time; ajuste de pesos | v3.1–v3.3 |
| **v3.5 — (opcional) Señales avanzadas** | contributor-overlap, pesos aprendidos (ML), correlación con CI | v3.4 |

> **v3.0 es innegociable como primera fase:** sin la tubería de archivos arreglada
> (review F-1/F-2), todo lo demás recibe el conjunto vacío. Es a la vez deuda de v2 y
> fundación de v3.

## 4. Matriz valor × esfuerzo

```text
                 ESFUERZO BAJO                  │  ESFUERZO ALTO
   ┌───────────────────────────────────────────┼──────────────────────────────────────┐
 V │  ★ Overlap engine file-level (v3.1)         │  ★ Backtest + calibración (v3.4)      │
 A │     (reusa heat de V2.i como prior)         │     (la prueba de que v3 vale)         │
 L ├───────────────────────────────────────────┼──────────────────────────────────────┤
 O │  Regla predicted_conflict + endpoint (v3.3) │  Fundación de datos / mirror (v3.0)    │
 R │                                             │  Hunk precision + confirmación (v3.2)  │
   └───────────────────────────────────────────┴──────────────────────────────────────┘
```

Orden sugerido: **v3.0** (obligatoria) → **v3.1** (valor visible: ya predice a nivel
archivo) → **v3.3** (lo hace accionable) → **v3.4** (lo valida y calibra) → **v3.2/3.5**
(precisión). v3.1 ya entrega valor antes de invertir en hunks.

## 5. Decisiones de arquitectura (ADRs, resumen — detalle en spec)

| ADR | Decisión | Por qué |
|---|---|---|
| V3-1 | Diff-por-PR + intersección (O(P)); merge-tree solo para confirmar top-K | O(P²) merges no escala; el conjunto de archivos basta para el score |
| V3-2 | Modelo rule-based explicable; ML diferido | Sin datos etiquetados no hay ML; la transparencia importa para confiar en alertas |
| V3-3 | Predicciones = read model materializado **no** event-sourced | Corrige la grieta de V2.i (F-3); determinismo = función pura del input |
| V3-4 | Reusar `conflict_heat` de V2.i como prior de zona | El histórico de zonas calientes ya existe; no recalcular |
| V3-5 | PR refs vía refspec `+refs/pull/*/head:...` | Prerrequisito P1; sin esto el collector recibe vacío |
| V3-6 | Degrade graceful sin git / sin hunks | ZooDash debe correr en entornos sin git; file-level es suficiente |
| V3-7 | Backtest **sintético primario**, histórico best-effort | No hay diffs históricos en `event_log`; lo sintético es determinista |
| V3-8 | Dos `kind` de predicción: `pr_pr` y `pr_base` | Cubren las dos formas de choque latente |

## 6. Gobernanza heredada (innegociable, también en v3)

- Solo **lectura** sobre `Zoo-Code-Org/Zoo-Code` y sobre `zSys/.context_sync/`; **no**
  abrir PRs/issues en upstream (Zoo-Code está en freeze).
- **No** tocar el fork `Zoo-Code-contrib`. El clon para `git diff`/`merge-tree` es el
  mirror read-only **dedicado** (`~/.cache/zoodash/repo.git`), distinto del fork. Solo
  `fetch` (read) y `diff`/`merge-tree` (no mutan). Test de no-daño obligatorio.
- Discord = del runtime; **nunca** scraping. (No aplica a v3, se mantiene.)
- Compose **propio** de ZooDash; no mezclar con la malla de ZordonOS.
- Commits **sin** trailer de IA (autor Armando Vaquera); respuestas en español, código e
  identificadores en inglés.
- Todas las escrituras dentro de `/Users/dr.armandovaquera/ZooDash/`.
