# ZooDash v3 — Predictive Conflict — Pruebas y Simulación

> **Estado:** 🟡 Diseño (no implementar aún). Suplementa
> [PREDICTIVE_CONFLICT_SPEC.md](./PREDICTIVE_CONFLICT_SPEC.md) y hereda la filosofía de
> [../v2/TESTING_AND_SIMULATION.md](../v2/TESTING_AND_SIMULATION.md): **validar con
> simulación antes de conectar nada real**, y **medir** el valor (no afirmarlo).
>
> **Lecciones de la auditoría aplicadas aquí (review F-6/F-7/F-8):**
> 1. Los tests **importan la fórmula real**; nunca la reimplementan en el test.
> 2. Los tests de Python **corren** en el pipeline (`pnpm test:py`), no quedan huérfanos.
> 3. El **no-daño** al fork es un test obligatorio, no una promesa de prosa.
> 4. El determinismo se prueba con **golden-input** ejecutado N veces (no se finge replay).

---

## 1. Pirámide de pruebas v3

| Nivel | Qué | Herramienta | Coste |
|---|---|---|---|
| **Unit** | parser de hunks (`@@`), `classifyPrediction`, fórmula de `probability`, `normalizeZone` (reuso V2.i), Jaccard | vitest (TS) + pytest (Py) | rápido, sin infra |
| **Integración** | collector (`git diff`) sobre repo sembrado → `pr_changed_file`; projector → `conflict_prediction`; regla `predicted_conflict` → `alert`+`decision_log` | repo git temporal + SQLite `:memory:` | medio |
| **Determinismo** | mismo input ⇒ mismo output, N corridas (golden-input) | vitest | rápido |
| **Simulación** | generador sintético de PRs con choques programados → métricas | script + vitest/pytest | medio |
| **Backtest** | precision/recall/F1 + lead-time sobre escenarios (sintético; histórico best-effort) | arnés dedicado | medio |
| **No-daño** | `git -C <fork> status` y `git -C <mirror> status` limpios tras todo | script | rápido, **obligatorio** |
| **E2E** | `/api/predictions` + vista (matriz/lista + KPI lead-time) | Playwright | lento |

---

## 2. Unit — fórmula importada, no duplicada (corrige F-6)

```typescript
// src/lib/__tests__/predict-overlap.test.ts
import { describe, it, expect } from "vitest";
// ✅ importar la función REAL del source (no reescribir la fórmula en el test)
import { scoreProbability, classifyPrediction, DEFAULT_WEIGHTS }
  from "@/lib/predict/overlap";

describe("scoreProbability", () => {
  it("0 cuando no hay archivos compartidos", () => {
    expect(scoreProbability({ jaccard: 0, sharedNorm: 0, hunkRatio: 0, zoneWeight: 0 },
      DEFAULT_WEIGHTS)).toBe(0);
  });
  it("crítico: líneas solapadas en zona caliente", () => {
    const p = scoreProbability(
      { jaccard: 0.8, sharedNorm: 1, hunkRatio: 1, zoneWeight: 1 }, DEFAULT_WEIGHTS);
    expect(p).toBeGreaterThanOrEqual(0.76);
    expect(classifyPrediction(p)).toBe("critical");
  });
  it("clamp a 1.0", () => {
    const p = scoreProbability(
      { jaccard: 5, sharedNorm: 5, hunkRatio: 5, zoneWeight: 5 }, DEFAULT_WEIGHTS);
    expect(p).toBe(1);
  });
});

describe("classifyPrediction", () => {
  it.each([[0.1,"low"],[0.25,"low"],[0.26,"medium"],[0.5,"medium"],
           [0.51,"high"],[0.75,"high"],[0.76,"critical"],[1,"critical"]] as const)(
    "%f → %s", (p, lvl) => expect(classifyPrediction(p)).toBe(lvl));
});
```

```python
# ingest/test_changed_file_collector.py  (corre con pnpm test:py)
from ingest.changed_file_collector import parse_unified_hunks

def test_parse_hunks_basic():
    diff = "+++ b/src/lib/db.ts\n@@ -10,2 +10,3 @@\n@@ -40,0 +42,5 @@\n"
    hunks = parse_unified_hunks(diff)
    assert (10, 12) in [(h["start_line"], h["end_line"]) for h in hunks]
    assert (42, 46) in [(h["start_line"], h["end_line"]) for h in hunks]

def test_parse_hunks_pure_deletion():
    diff = "+++ b/x.ts\n@@ -5,3 +5,0 @@\n"   # borrado puro → rango de toque en 5
    hunks = parse_unified_hunks(diff)
    assert hunks[0]["start_line"] == 5
```

---

## 3. Integración — collector sobre repo sembrado (corrige F-2/F-7)

### 3.1 Seed: dos PRs que tocan el mismo archivo

```bash
# sim/seed_predict.sh — repo temporal con dos ramas que se solapan
set -e
d=$(mktemp -d); cd "$d"; git init -q -b main
printf 'a\nb\nc\nd\ne\n' > shared.txt
printf 'x\n' > only_a.txt; printf 'y\n' > only_b.txt
git add .; git commit -qm base
# Rama PR-A: toca shared.txt (líneas altas) + only_a.txt
git switch -qc pr-a
printf 'a\nb\nc\nd\nA\n' > shared.txt; printf 'x2\n' > only_a.txt
git commit -qam a
# Rama PR-B: toca shared.txt (mismas líneas bajas) + only_b.txt
git switch -qc pr-b main
printf 'a\nB\nc\nd\ne\n' > shared.txt; printf 'y2\n' > only_b.txt
git commit -qam b
echo "=== files(PR-A) vs base ==="; git diff --name-only main..pr-a
echo "=== files(PR-B) vs base ==="; git diff --name-only main..pr-b
echo "repo: $d"   # esperado: shared.txt en ambos → predicción pr_pr
```

**Valida:** `collect_changed_files()` produce `pr_changed_file` con `shared.txt` para
ambos PRs; el projector genera una predicción `pr_pr` con `shared_files=1`. Con hunks
(v3.2): A toca líneas ~5, B toca línea ~2 → `hunk_overlap` depende del solape real
(aquí parcial), ejercitando la rama de líneas.

### 3.2 Caso negativo (corrige sobre-predicción)

PR-A toca solo `only_a.txt`, PR-B solo `only_b.txt` → **0 predicciones**. Test explícito
de que archivos disjuntos no generan ruido.

### 3.3 Reconciliación (P4)

Sembrar 2 PRs → recolectar → cerrar PR-B (quitarlo del set de abiertos) → recolectar de
nuevo → `pr_changed_file` ya no contiene PR-B y la predicción desaparece.

---

## 4. Determinismo por golden-input (corrige F-8, aplica ADR-V3-3)

Como las predicciones **no** son event-sourced, su determinismo se prueba como **función
pura**: fijar un `pr_changed_file` + `conflict_heat` "golden" en una DB `:memory:`,
ejecutar `refreshConflictPredictions()` N veces y verificar que `conflict_prediction` es
**idéntico** (mismas filas, mismos scores) cada vez y entre corridas.

```typescript
// src/lib/__tests__/predict-determinism.test.ts
it("mismo input → mismo conflict_prediction (10 corridas)", () => {
  const db = seedGolden();                  // pr_changed_file + conflict_heat fijos
  const snapshots: string[] = [];
  for (let i = 0; i < 10; i++) {
    refreshConflictPredictions(db);
    snapshots.push(JSON.stringify(
      db.prepare("SELECT * FROM conflict_prediction ORDER BY pr_a, pr_b").all()));
  }
  expect(new Set(snapshots).size).toBe(1);  // todas idénticas
});
```

> **Nota:** `refreshed_at`/`predicted_at` deben tomarse de un `now` inyectable (no
> `new Date()` interno) para que el golden sea estable — misma disciplina R1 que V2.h.

---

## 5. Simulación — generador sintético (ADR-V3-7, primario)

El corazón de la validación. Un generador determinista crea un universo de PRs con
**choques programados** y una **agenda de merge**, sin red ni git.

### 5.1 Modelo del generador

```
generateScenario(seed) → {
  prs: [{ number, files: string[], hunksByFile, openedAt }],
  mergeSchedule: [{ prNumber, mergedAt }],     # orden real de merge
  groundTruth: [{ prNumber, becameConflictingAt }]  # derivado: un PR choca si,
      # al mergearse otro PR antes que él, comparten archivo+línea
}
```

`groundTruth` se computa **analíticamente** desde el escenario (sabemos quién chocará
con quién y cuándo), independiente del predictor. El predictor se corre "en el tiempo T"
(antes de los merges) y se compara contra `groundTruth`.

### 5.2 Qué mide

Para cada escenario: alimentar `pr_changed_file`/`hunk`/`conflict_heat` con el estado en
T, correr `refreshConflictPredictions()`, y clasificar cada par:

- **TP** — predijo (`probability ≥ umbral`) y el groundTruth confirma choque.
- **FP** — predijo y nunca chocó.
- **FN** — no predijo y sí chocó.
- **lead-time** — `becameConflictingAt − T` para los TP.

### 5.3 Familias de escenarios

| Escenario | Propósito |
|---|---|
| `disjoint` | PRs sin archivos comunes → 0 predicciones (FP=0 esperado) |
| `same-file-diff-lines` | mismo archivo, líneas lejanas → file-level predice, hunk lo baja |
| `same-file-same-lines` | choque real → debe ser TP de nivel alto/crítico |
| `hot-zone` | overlap en zona con `conflict_heat` alto → el prior debe elevar el nivel |
| `fan-out` | 1 PR base + N PRs que lo tocan → N predicciones priorizadas |
| `churn` | PRs que abren/cierran → ejercita reconciliación + estabilidad de métricas |

### 5.4 Gate de calibración

Los pesos `DEFAULT_WEIGHTS` se ajustan hasta cumplir, sobre el set sintético:
**recall ≥ 0.8** y **precision ≥ 0.6** (números iniciales, revisables). El resultado se
persiste en `prediction_backtest` (`mode='synthetic'`) para comparar entre ajustes.

---

## 6. Backtest histórico (best-effort, ADR-V3-7)

Complementa lo sintético con datos reales **limitados**:

- Para PRs cuyos `refs/pull/<n>/head` aún existen en el mirror y que históricamente
  pasaron a `CONFLICTING` (tenemos el evento `pr.conflict` con su `ts` en `event_log`),
  reconstruir `files(PR)` en un commit anterior y correr el predictor "como en T".
- Cerrar el lazo: rellenar `became_conflicting_at`/`lead_time_seconds` en
  `conflict_prediction` desde los eventos reales para reportar lead-time **real**.

**Limitación honesta:** sin diffs históricos en `event_log` (review F-3) y con retención
de refs variable, la cobertura histórica es parcial. Por eso es complementaria, no el
gate. El KPI publicado distingue `synthetic` de `historical`.

---

## 7. No-daño — obligatorio (gobernanza)

```bash
# sim/assert_no_damage.sh — corre tras toda la suite de integración/simulación
set -e
for repo in "$ZOO_FORK" "$ZOODASH_REPO_MIRROR"; do
  [ -d "$repo" ] || continue
  status=$(git -C "$repo" status --porcelain)
  if [ -n "$status" ]; then echo "❌ MUTACIÓN en $repo:"; echo "$status"; exit 1; fi
done
echo "✅ fork y mirror intactos"
```

`merge-tree --write-tree` y `diff` no escriben en el árbol de trabajo; `fetch` solo
actualiza refs del **mirror dedicado**, nunca del fork. Este test lo verifica en cada
corrida (criterio de aceptación #12 de la spec).

---

## 8. Pipeline de pruebas

```jsonc
// package.json (propuesta)
"scripts": {
  "test": "vitest run",
  "test:py": "python3 -m pytest ingest/ -q",     // ← conecta los tests Python (P6)
  "test:all": "pnpm test && pnpm test:py && bash sim/assert_no_damage.sh"
}
```

`test:all` es el gate antes de cerrar cualquier fase de v3. Si `pytest` no está
disponible en el entorno, `test:py` debe **fallar visiblemente** (no pasar en silencio),
para no repetir F-7.

---

## 9. Criterios de aceptación de pruebas

1. **Parser de hunks** extrae rangos correctos (incl. borrado puro) — unit Py+TS.
2. **Fórmula importada** del source (no duplicada) — unit TS (corrige F-6).
3. **Collector** sobre repo sembrado produce `pr_changed_file` correcto — integración.
4. **Caso negativo:** PRs disjuntos → 0 predicciones — integración.
5. **Reconciliación:** PR cerrado desaparece al siguiente ciclo — integración.
6. **Determinismo:** mismo input → mismo output, 10 corridas — golden-input.
7. **Zone prior:** `conflict_heat` alto eleva el nivel — integración.
8. **Simulación:** recall ≥ 0.8 y precision ≥ 0.6 en el set sintético — gate.
9. **Lead-time:** reportado (p50/p90) y persistido en `prediction_backtest`.
10. **No-daño:** fork y mirror limpios tras todo — obligatorio.
11. **Pipeline:** `pnpm test && pnpm test:py` verdes; `test:py` falla si pytest falta.
12. **E2E:** `/api/predictions` + vista renderizan matriz/lista + KPI.
