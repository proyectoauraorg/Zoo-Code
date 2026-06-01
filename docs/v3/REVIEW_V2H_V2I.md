# Revisión profunda archivo-por-archivo — V2.h / V2.i

> **Propósito:** pasada de cobertura sobre el **código ya implementado** de V2.h
> (Event Store + Replay, v1.3.0) y V2.i (Conflict Files + Heat + Age Risk, v1.4.0),
> **antes** de construir v3. No es la spec de v3 — es la base que v3 hereda. Los
> hallazgos marcados **[BLOQUEA v3]** son prerrequisitos.
>
> **Método:** lectura de cada archivo fuente + `pnpm test` (50/50 verde) +
> verificación de `git merge-tree` (git 2.53). Cada hallazgo cita `archivo:línea`.
>
> **Estado del gate:** revisado 2026-05-30. 50 tests TS pasan; los tests Python
> **no se ejecutan** en el pipeline actual (ver F-7).

---

## 0. Qué está sólido (no tocar)

Dos cosas que parecían sospechosas en la spec y que el código **sí resuelve bien**:

- **Parity checker real.** [parity-checker.ts:40](../../src/lib/replay/parity-checker.ts#L40)
  no es un smoke-test: `compareTable()` hace match por clave, compara columnas
  declaradas, tolerancia numérica para `pressure_score` (|Δ|>0.001), y nivel
  semántico sobre `decision_log` (triggered/message/pressure). Detecta divergencias
  de verdad.
- **Shadow mode aísla.** [engine.ts:55](../../src/lib/replay/engine.ts#L55): en
  `intoTarget:"shadow"` crea tablas `_replay`, **no** llama `clearProjections()`
  (eso solo ocurre en live no-dryRun, [engine.ts:57](../../src/lib/replay/engine.ts#L57)),
  y enhebra el flag `shadow` por los projectors y el alerting (`suffix="_replay"`,
  guard `if (!suffix)` para no insertar alertas reales). `POST /api/replay` es por
  tanto **no destructivo**.

El resto del determinismo (R1/R4/R5: `globalOrder`, `ORDER BY ts,id`, `INSERT OR IGNORE`,
`now` como parámetro) está bien aplicado en `engine.ts` y `alerting/engine.ts`.

---

## 1. Hallazgos (por severidad)

| # | Sev | Área | Hallazgo | Evidencia |
|---|---|---|---|---|
| **F-1** | **[BLOQUEA v3]** | V2.i enricher | El mirror **no tiene los `refs/pull/*`**. `update_mirror` hace `git fetch origin` sin refspec de PRs; GitHub **no** anuncia `refs/pull/*` por defecto. `get_merge_refs` hace `git rev-parse refs/pull/N/head` → falla siempre en prod → "no refs found" para todo PR → `conflict_file` queda vacío → hotspots caen a `PR#N` permanentemente. Los tests pasan porque usan ramas locales (`refs/heads`), nunca pull-refs. | [conflict_enricher.py:83](../../ingest/conflict_enricher.py#L83), [:143](../../ingest/conflict_enricher.py#L143) |
| **F-2** | **[BLOQUEA v3]** | V2.i enricher | `git merge-tree base head` (2 args). En git ≥2.38 eso es la forma **nueva** (`--write-tree`) → emite `CONFLICT (content): ...` → solo casa `CONFLICT_RE`; `CHANGED_BOTH_RE` (formato viejo de 3 args) nunca casa en prod. En git <2.38 la forma de 2 args es inválida. Invocación no fijada por versión. | [conflict_enricher.py:226](../../ingest/conflict_enricher.py#L226) |
| **F-3** | **[BLOQUEA v3]** | V2.h replay | **Replay no cubre las tablas V2.i.** `executeReplay` solo reproyecta `conflict_lifecycle` + `conflict_trajectory` + alerting; nunca llama `projectConflictFiles`, y `checkParity` no compara `conflict_file/hotspot/heat/age_risk`. Contradice **ADR-V2I-7** y el criterio de aceptación **#12** de V2.i ("replay incluye las nuevas tablas"). Causa raíz: `conflict_file` lo escribe el enricher Python, **no** hay eventos `pr.conflict_file` en `event_log` → esos read models **no son event-sourced** y son irreproducibles por diseño. | [engine.ts:78](../../src/lib/replay/engine.ts#L78), [parity-checker.ts:49](../../src/lib/replay/parity-checker.ts#L49) |
| **F-4** | Alto | V2.i enricher | **Sin reconciliación de `resolved_at`.** Solo `INSERT OR IGNORE`; `resolved_at` nunca se escribe. Al resolverse un conflicto, sus `conflict_file` siguen con `resolved_at IS NULL` para siempre → hotspots/heat/age_risk (todos filtran `resolved_at IS NULL`) cuentan conflictos resueltos como activos → sobreconteo permanente. | grep `resolved_at` en enricher = ∅ |
| **F-5** | Alto | V2.h contrato | `verifyReplayIntegrity()` —prometida por V2H §3.3, §4.2 (PASO 7), ADR-V2H-4 y aceptación #12— **no existe ni se exporta**. El barrel solo expone `executeReplay/globalOrder/checkParity`. El gate "obligatorio antes de cerrar" se hace inline en el endpoint, sin la función nombrada del contrato. | grep solo en `docs/` |
| **F-6** | Medio | Tests | `age-risk.test.ts` **redefine** `computeRiskScore` dentro del test ([:16](../../src/lib/__tests__/age-risk.test.ts#L16)) en vez de importar la fórmula real de `refreshConflictAgeRisk`. La fórmula del source queda **sin test**: si deriva, el test no lo detecta. Solo `classifyRisk` se importa de verdad. | [age-risk.test.ts:16](../../src/lib/__tests__/age-risk.test.ts#L16) |
| **F-7** | Medio | Tests | `test_conflict_enricher.py` **no corre** (pytest ausente; `pnpm test` solo TS). Cubre solo `parse_merge_tree`. Faltan: integración con repo sembrado (V2I §8.4), test no-daño (`git -C <fork> status` limpio, criterio #9), mirror read-only (#10), degrade sin git (#11). Esos criterios de aceptación **no están verificados automáticamente**. | `pytest` → "no tests ran" |
| **F-8** | Medio | Tests | `replay-determinism.test.ts` solo prueba `globalOrder` (puro) + formas de tipos. **No** ejecuta `executeReplay` contra una DB sembrada, **no** prueba paridad shadow end-to-end, **no** prueba que `checkParity` detecte una divergencia real (su rama de diff queda sin cobertura). | [replay-determinism.test.ts:29](../../src/lib/__tests__/replay-determinism.test.ts#L29) |
| **F-9** | Bajo | V2.i endpoint | `/api/conflicts` **no** devuelve `enricherStatus { lastRun, mirrorOk, filesTracked }` (prometido en V2I §6.1). Sin él, el fallback silencioso de F-1 es invisible para el operador. | [route.ts:48](../../src/app/api/conflicts/route.ts#L48) |
| **F-10** | Bajo | V2.h replay | `ReplayOptions.only` se declara y se testea por tipos, pero `executeReplay` **nunca lo lee**. Opción muerta. | [engine.ts:20](../../src/lib/replay/engine.ts#L20) |
| **F-11** | Bajo | V2.h replay | **Fuga de rango temporal.** El loop respeta `[from,to]` para lifecycle/trajectory, pero la detección de cooldown-breach consulta `event_log` **completo** ([engine.ts:277](../../src/lib/replay/engine.ts#L277)), y el alerting de `ci_persistent`/`system_health` lee `pr_snapshot`/`system_snapshot` **live** (no rangeados). El time-travel (`to: pasado`) mezcla estado futuro. OK para paridad de conflictos; leaky para time-travel. | [engine.ts:277](../../src/lib/replay/engine.ts#L277) |
| **F-12** | Bajo | V2.i projector | **Doble cálculo de `conflict_hotspot`.** `runProjectors` llama `refreshConflictHotspot` (V2.f) y luego `projectConflictFiles`→`refreshConflictFileHotspots` (V2.i), que hace `DELETE` y sobrescribe lo del primero. El projector V2.f es trabajo muerto cada ciclo. | [projector/index.ts:29](../../src/lib/projector/index.ts#L29) vs [:39](../../src/lib/projector/index.ts#L39) |
| **F-13** | Bajo | V2.i linkage | `conflict_file.conflict_id` puede ser `auto:{pr}` o `auto:{pr}`/`f"auto:{n}"` cuando no hay fila en `conflict_lifecycle` (enricher lee `pr_snapshot.mergeable`, el lifecycle viene de eventos `pr.conflict` — pueden divergir si los eventos van con retraso). El age_risk hace `JOIN ... cf.conflict_id = cl.id`: archivos sin lifecycle no casan → `file_count=0` en age_risk (sí cuentan en heat/hotspots). Linkage frágil. | [conflict_enricher.py:123](../../ingest/conflict_enricher.py#L123), [conflict-file.ts:201](../../src/lib/projector/conflict-file.ts#L201) |
| **F-14** | Limpieza | Repo | `ingest/conflict_enricher.py.bak` versionado (~7 KB). Eliminar. | `ls ingest/` |

---

## 2. Lectura transversal: la grieta arquitectónica

F-1, F-2, F-3 y F-4 son el **mismo problema visto desde cuatro ángulos**: los read
models de archivos de V2.i (`conflict_file → hotspot/heat/age_risk`) dependen de una
**salida lateral del enricher Python** que (a) hoy no obtiene datos reales del repo
(F-1/F-2), (b) no se reconcilia al resolverse (F-4) y (c) **no vive en `event_log`**,
por lo que el replay determinista de V2.h no puede reconstruirlos (F-3).

Para v3 esto es decisivo: **Predictive Conflict necesita los archivos cambiados por
rama como insumo primario.** No puede construirse sobre una tubería que en producción
entrega vacío. Por eso v3.0 **debe** arreglar el mirror (refspec de PRs) y la captura
de archivos antes que nada, y debe **declarar explícitamente** el estatus de replay de
sus propios read models (igual que debió hacer V2.i).

---

## 3. Prerrequisitos para v3 (derivados de la revisión)

| Prereq | Resuelve | Acción mínima |
|---|---|---|
| **P1 — Mirror con PR refs** | F-1 | Configurar refspec `+refs/pull/*/head:refs/pull/*/head` (o usar `head_sha`/`base_sha` del snapshot si se exponen). Verificar `git -C <mirror> rev-parse refs/pull/<n>/head` en test. |
| **P2 — Captura de archivos fiable** | F-2 | v3 usa `git diff --name-only <merge_base>..<head>` (conjunto de archivos por rama), no marcadores de conflicto. `git merge-tree --write-tree` solo para *confirmar* pares top-K. Fijar versión git ≥2.38 y `-z`. |
| **P3 — Estatus de replay declarado** | F-3 | Decidir y documentar (ADR): los read models de archivos/predicción son **materializados no-event-sourced**; el determinismo se garantiza como **función pura de su input** (snapshot de archivos + `conflict_heat`), no por replay de `event_log`. Acotar el Determinism Contract a ese alcance. |
| **P4 — Reconciliación** | F-4 | Patrón v3: `DELETE + INSERT` por ciclo sobre PRs abiertos (como age_risk/heat), no `INSERT OR IGNORE` acumulativo. Las predicciones caducan solas. |
| **P5 — Visibilidad** | F-9 | `GET /api/predictions` y `/api/conflicts` exponen `collectorStatus { lastRun, mirrorOk, prsTracked }`. |
| **P6 — Tests que sí corren** | F-6/F-7/F-8 | v3 importa la fórmula real (no la duplica), añade integración con repo sembrado y test no-daño, y conecta pytest al pipeline (`package.json` script `test:py` o documentar el comando). |

---

## 4. Deuda no bloqueante (registrar, no urgente)

F-5 (implementar `verifyReplayIntegrity()` como wrapper nombrado), F-10 (honrar o
quitar `only`), F-11 (rangear cooldown/alerting o documentar el límite del time-travel),
F-12 (un solo projector de hotspot), F-13 (linkage `conflict_id` robusto), F-14 (borrar
`.bak`). Ninguno bloquea v3; conviene saldarlos en una pasada de mantenimiento.

---

## 5. Veredicto

V2.h (replay/parity/decision-log) está **bien construido** y es base sólida.
V2.i (capa temporal + UI heat/age-risk) está bien en TS, pero su **tubería de datos
reales (enricher → mirror) no funciona en producción tal cual** (F-1/F-2) y sus read
models no encajan en el contrato de replay (F-3). v3 **no parte de cero**: parte de
arreglar P1–P4, que también son justo lo que Predictive Conflict necesita. La spec de
v3 (`PREDICTIVE_CONFLICT_SPEC.md`) los incorpora como Fase 0.
