# ZooDash v3 — Predictive Conflict — Spec

> **Estado:** 🟡 Diseño (no implementar aún).
> **Autoridad:** Este documento define v3 completo: collector de archivos por rama,
> overlap engine, modelo de probabilidad, confirmación por merge-tree, regla de
> alerting, endpoint y vista. Suplementa [README.md](./README.md),
> [DATA_MODEL_v3.sql](./DATA_MODEL_v3.sql), [TESTING_AND_SIMULATION.md](./TESTING_AND_SIMULATION.md)
> y la auditoría [REVIEW_V2H_V2I.md](./REVIEW_V2H_V2I.md).
>
> **Normativo:** El mirror read-only es **sagrado** — solo `git fetch`, `git diff`,
> `git merge-tree`. Nunca se escribe en el mirror ni en el fork de trabajo. Violaciones
> son bugs bloqueantes (hereda ADR-6 / ADR-V2I-1).
>
> **Prerrequisito:** la **Fase 0** salda P1–P6 de la auditoría. Sin el mirror con PR
> refs (P1) y la captura de archivos fiable (P2), el collector recibe el conjunto vacío.

---

## 0. Contexto y tesis

### 0.1 Qué resuelve GitHub hoy, y qué no

GitHub calcula `mergeable` de cada PR **contra su base**, de forma **reactiva** y
periódica. Dos vacíos:

1. **No hay visibilidad PR↔PR.** GitHub nunca dice "el PR #A y el PR #B chocarán entre
   sí". Solo lo descubres cuando uno se mergea y el otro pasa a `CONFLICTING`.
2. **El aviso llega tarde.** Para cuando aparece `CONFLICTING`, el solapamiento ya
   existe; el trabajo a rehacer ya está hecho.

V2.i (Conflict Tracker Fase B) cerró la capa **reactiva**: cuando un PR ya es
`CONFLICTING`, `git merge-tree` extrae **qué archivos** chocan, los agrega por zona
(`conflict_heat`) y prioriza por antigüedad (`conflict_age_risk`).

### 0.2 Tesis de v3

> El conjunto de archivos (y líneas) que **cada PR abierto** modifica respecto a su
> merge-base es computable **read-only** desde el mirror. Cruzar esos conjuntos entre
> PRs (y contra la deriva de `main`) **predice** el solapamiento **antes** de que
> GitHub marque `CONFLICTING`, con una probabilidad explicable que reusa el histórico
> de zonas calientes de V2.i como *prior*.

Dos formas de choque latente:

- **`pr_pr`** — `files(A) ∩ files(B) ≠ ∅` para dos PRs abiertos. Si uno se mergea, el
  otro probablemente pasará a `CONFLICTING`.
- **`pr_base`** — `files(PR) ∩ files_changed_on_main_since_mergebase(PR) ≠ ∅`. El PR
  quedó atrás justo donde modifica → pronto será `CONFLICTING`.

### 0.3 Por qué NO es event-sourced (consecuencia de la auditoría)

La revisión (F-3) mostró que los read models de archivos de V2.i **no** viven en
`event_log` y por tanto el replay de V2.h **no** los reconstruye. v3 **asume esto
explícitamente** (ADR-V3-3): `pr_changed_file` y `conflict_prediction` son read models
**materializados por projector puro**, no event-sourced. Su determinismo se garantiza
y se prueba como **función pura del input** (golden-input tests), no por paridad de
replay. Esto evita arrastrar la grieta de V2.i a v3.

### 0.4 Pipeline completo

```
PRs abiertos (pr_snapshot último poll, state=OPEN, is_draft=0)
  │
  ├─ Fase 0: mirror read-only CON refs/pull/* (refspec corregido)
  │
  ├─ collector (Python): por PR → merge-base + `git diff --name-only` (+ -U0 hunks)
  │     → pr_changed_file (+ pr_changed_hunk)     [DELETE+INSERT por ciclo, P4]
  │
  ├─ projector (TS): overlap pairwise sobre PRs abiertos
  │     → conflict_prediction   (file overlap + Jaccard + hunk + zone prior)
  │
  ├─ confirmación (v3.2, top-K): `git merge-tree --write-tree` → confirmed=1
  │
  ├─ alerting (V2.h): regla predicted_conflict → alert + decision_log
  │
  └─ endpoint GET /api/predictions  +  vista (matriz/lista + lead-time KPI)
```

---

## 1. Fase 0 — Fundación de datos (salda la auditoría)

Antes de cualquier predicción. Cada item referencia el prerrequisito de
[REVIEW_V2H_V2I.md §3](./REVIEW_V2H_V2I.md).

### 1.1 Mirror con PR refs (P1, corrige F-1)

El collector configura el mirror para traer los `refs/pull/*/head`:

```python
# Al crear/asegurar el mirror, fijar el refspec de PRs (idempotente):
def ensure_pull_refspec(mirror: Path) -> None:
    """Añade el refspec de PRs si no está. Read-only en efecto (solo fetch)."""
    existing = subprocess.check_output(
        ["git", "-C", str(mirror), "config", "--get-all", "remote.origin.fetch"],
        text=True,
    ).splitlines()
    spec = "+refs/pull/*/head:refs/pull/*/head"
    if spec not in existing:
        subprocess.check_call(
            ["git", "-C", str(mirror), "config", "--add", "remote.origin.fetch", spec]
        )
    # luego: git fetch origin --prune  (ya trae refs/pull/*/head)
```

> **Alternativa (ADR-V3-5):** si el runtime expone `head_sha`/`base_sha` por PR en el
> snapshot, usarlos directamente y evitar depender de los pull-refs. Hoy `pr_snapshot`
> **no** los tiene (solo `head_ref`/`base_ref` en otra tabla y `mergeable`), así que el
> refspec es el camino por defecto. Documentar la decisión al implementar.

**Test de aceptación P1:** tras `fetch`, `git -C <mirror> rev-parse refs/pull/<n>/head`
resuelve para PRs reales (no en el seed de ramas locales — eso ya pasaba).

### 1.2 Captura por diff, no por merge-tree (P2, corrige F-2)

v3 necesita el **conjunto de archivos de cada rama**, no marcadores de conflicto:

```
git -C <mirror> diff --name-status -M -z <base>..<head>     # archivos + A/M/D/R
git -C <mirror> diff --numstat -z <base>..<head>            # additions/deletions
git -C <mirror> diff -U0 <base>..<head>                     # hunks (v3.2)
```

donde `base = git merge-base origin/main refs/pull/<n>/head`. Esto es O(P) operaciones
git (una por PR), no O(P²). `merge-tree` se reserva para **confirmar** pares de alto
score (v3.2, §5). Fijar git ≥2.38 y usar `-z` (NUL-separado) para paths con espacios.

### 1.3 Reconciliación por ciclo (P4, corrige F-4)

`pr_changed_file`/`pr_changed_hunk`/`conflict_prediction` se refrescan con **DELETE +
INSERT** sobre el conjunto de PRs abiertos del último poll (patrón de `age_risk`/`heat`),
no `INSERT OR IGNORE` acumulativo. Un PR que se cierra/mergea desaparece de las tablas
al siguiente ciclo; las predicciones caducan solas.

### 1.4 Visibilidad (P5, corrige F-9) y tests reales (P6, corrige F-6/F-7/F-8)

- `collectorStatus { lastRun, mirrorOk, prsTracked, gitVersion }` expuesto en
  `/api/predictions` y `/api/conflicts`.
- Tests que **importan la fórmula real** (no la duplican), integración con repo
  sembrado, test no-daño (`git -C <fork> status` limpio), y pytest conectado al
  pipeline (`pnpm test:py` o documentado). Detalle en
  [TESTING_AND_SIMULATION.md](./TESTING_AND_SIMULATION.md).

---

## 2. Schema

Ver [DATA_MODEL_v3.sql](./DATA_MODEL_v3.sql) para el DDL completo. Resumen:

| Tabla | Fase | Rol |
|---|---|---|
| `pr_changed_file` | v3.0 | Archivos por PR vs merge-base (insumo primario) |
| `pr_changed_hunk` | v3.2 | Rangos de línea por PR (precisión) |
| `conflict_prediction` | v3.1 | Predicción materializada por par/PR |
| `prediction_backtest` | v3.4 | Resultados de validación (precision/recall/lead-time) |

Claves de diseño: orden canónico `pr_a < pr_b` (evita duplicar (A,B)/(B,A));
`kind='pr_base'` ⇒ `pr_b IS NULL`; `probability ∈ [0,1]`, `risk_score = round(prob*100)`.

---

## 3. Collector — Módulo Python (`ingest/changed_file_collector.py`)

### 3.1 Tesis

Patrón de [`conflict_enricher.py`](../../ingest/conflict_enricher.py) (V2.i), pero
capturando **archivos cambiados por rama** en vez de archivos en conflicto. Reusa el
mismo mirror read-only (corregido en Fase 0) y la misma estrategia de degrade graceful.

### 3.2 Contract

```python
# ingest/changed_file_collector.py
from __future__ import annotations
from pathlib import Path
from typing import TypedDict

class ChangedFile(TypedDict):
    pr_number: int
    file_path: str
    change_kind: str          # A | M | D | R
    additions: int
    deletions: int
    base_sha: str
    head_sha: str

class Hunk(TypedDict):
    pr_number: int
    file_path: str
    start_line: int
    end_line: int

class CollectorResult(TypedDict):
    prs_scanned: int
    files_collected: int
    hunks_collected: int
    errors: list[str]
    mirror_ok: bool

def ensure_pull_refspec(mirror: Path) -> None: ...
def open_pr_numbers(conn) -> list[int]: ...                 # pr_snapshot último poll, OPEN, !draft
def merge_base(mirror: Path, pr_number: int) -> str | None: ...
def diff_name_status(mirror: Path, base: str, head: str) -> list[ChangedFile]: ...
def parse_unified_hunks(diff_u0: str) -> list[Hunk]: ...    # parsea cabeceras @@
def collect_changed_files(db_path: str, mirror: Path, repo_url: str,
                          with_hunks: bool = True) -> CollectorResult: ...
```

### 3.3 Algoritmo (esqueleto)

```python
def collect_changed_files(db_path, mirror, repo_url, with_hunks=True) -> CollectorResult:
    result = {"prs_scanned": 0, "files_collected": 0, "hunks_collected": 0,
              "errors": [], "mirror_ok": False}
    if not git_available():
        result["errors"].append("git not found"); return result          # ADR-V3-6

    ensure_mirror(mirror, repo_url)         # reusa helper de V2.i
    ensure_pull_refspec(mirror)             # P1
    try:
        update_mirror(mirror); result["mirror_ok"] = True                 # fetch --prune
    except subprocess.CalledProcessError as e:
        result["errors"].append(f"fetch failed: {e}"); return result

    conn = open_db(db_path)
    try:
        prs = open_pr_numbers(conn)
        now = now_iso()
        rows: list[ChangedFile] = []; hunks: list[Hunk] = []
        for n in prs:
            head = rev_parse(mirror, f"refs/pull/{n}/head")
            if not head:
                result["errors"].append(f"PR#{n}: no head ref"); continue   # F-1 visible
            base = merge_base(mirror, n)
            if not base:
                result["errors"].append(f"PR#{n}: no merge-base"); continue
            files = diff_name_status(mirror, base, head)                  # P2
            for f in files: f["base_sha"], f["head_sha"] = base, head
            rows.extend(files)
            if with_hunks:
                hunks.extend(parse_unified_hunks(
                    diff_u0(mirror, base, head)))
            result["prs_scanned"] += 1

        # Reconciliación por ciclo (P4): reemplazo atómico
        with conn:
            conn.execute("DELETE FROM pr_changed_file")
            conn.execute("DELETE FROM pr_changed_hunk")
            conn.executemany(INSERT_FILE_SQL, [(*to_row(r), now) for r in rows])
            conn.executemany(INSERT_HUNK_SQL, [(*to_row(h), now) for h in hunks])
        result["files_collected"] = len(rows)
        result["hunks_collected"] = len(hunks)
    finally:
        conn.close()
    return result
```

### 3.4 Parser de hunks (`git diff -U0`)

Las cabeceras tienen forma `@@ -a,b +c,d @@`. Interesa el lado nuevo (`+c,d`):
`start_line = c`, `end_line = c + max(d,1) - 1`. Si `d == 0` (borrado puro) el hunk no
añade líneas nuevas → se registra como rango de 0 longitud en `c` (marca de toque).

```python
import re
HUNK_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", re.MULTILINE)
def parse_unified_hunks(diff_u0: str, current_file_resolver) -> list[Hunk]:
    # se rastrea el archivo actual por las líneas "+++ b/<path>"; por cada @@,
    # se emite (start, end) sobre el lado nuevo. (Esqueleto; ver tests §parser.)
    ...
```

### 3.5 Integración con el pipeline

Igual que el enricher de V2.i: tras el historian, en el mismo ciclo.

```bash
python3 ingest/historian.py
python3 ingest/conflict_enricher.py        # V2.i (reactivo, archivos en conflicto)
python3 ingest/changed_file_collector.py   # v3 (predictivo, archivos por rama)
```

Sin git o sin mirror → no escribe nada; las predicciones quedan vacías y la UI lo
indica (ADR-V3-6).

---

## 4. Overlap Engine — Projector TypeScript (`src/lib/predict/overlap.ts`)

### 4.1 Tesis

El collector llena `pr_changed_file`. El projector (patrón de
[`conflict-file.ts`](../../src/lib/projector/conflict-file.ts)) cruza los conjuntos de
archivos de los PRs abiertos y materializa `conflict_prediction`. Acepta `db` como
parámetro (compatibilidad con tests/golden-input) y `now` para determinismo.

### 4.2 Contract

```typescript
// src/lib/predict/overlap.ts
import type Database from "better-sqlite3";

export interface PredictionWeights {
  wJaccard: number;   // peso del solapamiento relativo de archivos
  wShared: number;    // peso del nº absoluto de archivos compartidos (normalizado)
  wHunk: number;      // peso del solapamiento a nivel línea
  wZone: number;      // peso del prior de zona caliente (conflict_heat)
}

export const DEFAULT_WEIGHTS: PredictionWeights = {
  wJaccard: 0.35, wShared: 0.20, wHunk: 0.25, wZone: 0.20,
};

/** Refresca conflict_prediction (DELETE+INSERT). Devuelve nº de predicciones. */
export function refreshConflictPredictions(
  db: Database.Database,
  weights?: PredictionWeights,
): number;

/** Clasifica probability (0–1) en nivel. */
export function classifyPrediction(p: number): "low" | "medium" | "high" | "critical";
```

### 4.3 Cálculo de la probabilidad (rule-based, explicable — ADR-V3-2)

Para un par `(A,B)` con `FA = files(A)`, `FB = files(B)`:

```
shared      = |FA ∩ FB|
union       = |FA ∪ FB|
jaccard     = union > 0 ? shared / union : 0
sharedNorm  = min(shared / SHARED_SAT, 1)          # SHARED_SAT≈5 satura el conteo
hunkOverlap = nº de archivos compartidos cuyos rangos de línea se intersectan
hunkRatio   = shared > 0 ? hunkOverlap / shared : 0
zoneWeight  = max(conflict_heat.score) sobre las zonas de los archivos compartidos  # V2.i prior

probability = clamp01(
    wJaccard * jaccard +
    wShared  * sharedNorm +
    wHunk    * hunkRatio +
    wZone    * zoneWeight
)
risk_score  = round(probability * 100)
level       = classifyPrediction(probability)
```

Niveles (alineados con age-risk de V2.i para consistencia visual):

| `probability` | `level` | Lectura |
|---|---|---|
| 0.00–0.25 | `low` | tocan algún archivo común, sin solape de líneas |
| 0.26–0.50 | `medium` | varios archivos comunes o zona templada |
| 0.51–0.75 | `high` | muchos archivos + zona caliente o líneas solapadas |
| 0.76–1.00 | `critical` | líneas solapadas en zona caliente: choque casi seguro |

> **Sin hunks (v3.1, degrade ADR-V3-6):** `wHunk` se redistribuye a `wJaccard`/`wShared`
> y `hunkRatio=0`. La predicción file-level sigue siendo útil; los hunks (v3.2) solo
> afinan precisión.

### 4.4 Esqueleto del projector

```typescript
export function refreshConflictPredictions(db, weights = DEFAULT_WEIGHTS): number {
  db.prepare("DELETE FROM conflict_prediction").run();

  // 1. Cargar archivos por PR (solo PRs abiertos presentes en pr_changed_file)
  const byPr = new Map<number, Set<string>>();
  for (const r of db.prepare("SELECT pr_number, file_path FROM pr_changed_file").all())
    (byPr.get(r.pr_number) ?? byPr.set(r.pr_number, new Set()).get(r.pr_number)!).add(r.file_path);

  // 2. Prior de zona desde conflict_heat (V2.i) — Map<zone, score>
  const heat = new Map<string, number>(
    db.prepare("SELECT zone, score FROM conflict_heat").all().map(z => [z.zone, z.score]));

  // 3. Hunks por (pr,file) para overlap de líneas (v3.2)
  const hunks = loadHunks(db); // Map<`${pr}:${file}`, Array<[start,end]>>

  const prs = [...byPr.keys()].sort((a, b) => a - b);
  const now = new Date().toISOString();
  const rows: PredRow[] = [];

  // 4. Pairwise (orden canónico a<b)
  for (let i = 0; i < prs.length; i++)
    for (let j = i + 1; j < prs.length; j++) {
      const A = byPr.get(prs[i])!, B = byPr.get(prs[j])!;
      const shared = [...A].filter(f => B.has(f));
      if (shared.length === 0) continue;                    // sin overlap, sin fila
      rows.push(scorePair(prs[i], prs[j], A, B, shared, hunks, heat, weights, now));
    }

  // 5. pr_base: comparar cada PR con los archivos cambiados en main desde su merge-base
  //    (requiere capturar files(main since base) — ver §4.5)

  insertPredictions(db, rows);
  return rows.length;
}
```

### 4.5 `pr_base` — deriva contra `main`

Para `kind='pr_base'` necesitamos los archivos cambiados en `main` **desde** el
merge-base de cada PR. Dos opciones:

- **(a)** El collector, además del diff del PR, calcula
  `git diff --name-only <base>..origin/main` y lo guarda con `pr_number` y un marcador
  (`change_kind='B'` o tabla aparte). El projector cruza `files(PR) ∩ files(main-since-base)`.
- **(b)** Aproximación barata: `git merge-tree --write-tree origin/main refs/pull/<n>/head`
  para los PRs `MERGEABLE` (aún sin conflicto) → si reporta archivos, son deriva
  inminente. Más caro (un merge por PR) pero exacto.

ADR-V3-8 elige **(a) por defecto** (O(P), consistente con el resto) y deja **(b)** como
confirmación opcional (§5).

---

## 5. Confirmación por merge-tree (v3.2, opcional)

El score predice; `git merge-tree --write-tree` **confirma**. Para los top-K pares por
`risk_score` (K configurable, p.ej. 20):

```
git -C <mirror> merge-tree --write-tree --name-only refs/pull/<a>/head refs/pull/<b>/head
```

Si la salida lista archivos en conflicto real, se marca `confirmed=1` y se reusa el
parser de [`merge-tree-parser.ts`](../../src/lib/conflict/merge-tree-parser.ts) (V2.i).
Confirmar **no** cambia la probabilidad (es señal independiente para la UI: "predicho
vs. confirmado-latente"). Coste acotado a K merges/ciclo. Read-only (merge-tree no
escribe en el árbol de trabajo).

---

## 6. Alerting — Regla `predicted_conflict` (reusa V2.h)

Nueva regla en [`alerting/engine.ts`](../../src/lib/alerting/engine.ts), patrón de
`conflict_pressure`. Se evalúa sobre `conflict_prediction` y registra `decision_log`
(trazabilidad V2.h) — esto **sí** participa del determinismo de replay porque el
alerting ya está cubierto.

```typescript
// Añadir a DEFAULT_RULES:
{ id: "predicted_conflict", enabled: true,
  threshold: { probability: 0.6, minSharedFiles: 2 }, cooldownS: 21600 },

// case "predicted_conflict":
//   SELECT * FROM conflict_prediction
//     WHERE probability >= ? AND shared_files >= ? AND confirmed = 0
//     ORDER BY risk_score DESC
//   dedupeKey = `predicted_conflict:${pr_a}:${pr_b ?? 'base'}`
//   message   = `🔮 PR #A y #B comparten N archivos (prob X%) en zona <zone>`
//   → insertAlert(...) + tryRecordDecision({ entityKind:"pr", entityRef:`${pr_a}` , ... })
```

Anti-spam: dedupe por par + cooldown (6 h). La predicción confirmada (`confirmed=1`) o
ya `CONFLICTING` (entró a `conflict_lifecycle`) se excluye para no duplicar con las
reglas reactivas existentes.

---

## 7. Endpoint — `GET /api/predictions`

```typescript
interface PredictionEntry {
  kind: "pr_pr" | "pr_base";
  prA: number;
  prB: number | null;
  sharedFiles: number;
  sharedFilesList: string[];     // de shared_files_json
  jaccard: number;
  hunkOverlap: number;
  zoneWeight: number;
  probability: number;           // 0–1
  riskScore: number;             // 0–100
  level: "low" | "medium" | "high" | "critical";
  confirmed: boolean;
}

interface PredictionsResponse {
  ok: boolean;
  predictions: PredictionEntry[];        // ORDER BY risk_score DESC
  collectorStatus: {                     // P5 — visibilidad
    lastRun: string | null;
    mirrorOk: boolean;
    prsTracked: number;
    gitVersion: string | null;
  };
  validation: {                          // resumen del último backtest (si existe)
    precisionPct: number | null;
    recallPct: number | null;
    leadTimeP50H: number | null;
  } | null;
}
```

El endpoint hereda `withMetrics` y `force-dynamic` del resto. Degrade graceful: tablas
ausentes → `predictions: []`, `collectorStatus.mirrorOk: false`. `/api/conflicts` se
amplía con un campo `predicted` opcional para que la vista de conflictos muestre lo
reactivo y lo predictivo juntos.

---

## 8. Vista — `/conflicts` (sección "Predicción") o `/predictions`

### 8.1 Componentes nuevos

| Componente | Propósito |
|---|---|
| `PredictionMatrix` | Matriz PR×PR; celda coloreada por `level`, tooltip con archivos compartidos |
| `PredictionList` | Lista priorizada por `risk_score` con badge de nivel y "confirmado" |
| `PredictionBadge` | Reusa estética de `AgeRiskBadge` (green/yellow/orange/red) |
| `LeadTimeKpi` | KPI: "predijimos X% de conflictos, mediana N h antes" (del backtest) |

### 8.2 Realtime

`queryKey: ["predictions"]`; el projector publica `changed { entity: "predictions" }` al
canal de Redis pub/sub (cuando v2.1 esté activo) o se invalida en el mismo ciclo del
historian. TanStack Query refetch puntual, como el resto.

### 8.3 Contrato visual

Hereda tokens de [../ui-ux/STANDARDS.md](../ui-ux/STANDARDS.md). La matriz usa la misma
escala de color que el Heat Graph de V2.i para coherencia (zona caliente ↔ predicción
crítica comparten paleta).

---

## 9. Decisiones de diseño (ADRs)

### ADR-V3-1: Diff-por-PR + intersección O(P), no merge-tree pairwise O(P²)
**Decisión:** capturar `files(PR)` una vez por PR y cruzar en memoria; `merge-tree` solo
para confirmar top-K. **Razón:** con P PRs abiertos, O(P²) merges es caro y redundante;
el conjunto de archivos basta para el score; la confirmación cara se acota a los pares
que importan.

### ADR-V3-2: Modelo rule-based explicable; ML diferido
**Decisión:** score ponderado transparente (Jaccard + shared + hunk + zone). **Razón:**
no hay datos etiquetados hasta correr el backtest; una alerta predictiva debe ser
**explicable** ("comparten estos 3 archivos en esta zona caliente") para que el operador
confíe. ML (pesos aprendidos) se evalúa en v3.5 con las etiquetas del backtest.

### ADR-V3-3: Predicciones = read model materializado, NO event-sourced
**Decisión:** `pr_changed_file`/`conflict_prediction` no entran en `event_log` ni en el
parity-checker de V2.h. **Razón:** corrige la grieta de V2.i (review F-3): forzar estos
datos al replay sería falso (dependen de salida del git, no de eventos). El determinismo
se garantiza como **función pura del input** y se prueba con golden-input
(ver TESTING §determinismo).

### ADR-V3-4: Reusar `conflict_heat` (V2.i) como prior de zona
**Decisión:** el peso de zona sale del histórico de V2.i. **Razón:** ya materializa
"qué zonas chocan más"; reusarlo conecta lo reactivo (pasado) con lo predictivo (futuro)
y evita un segundo cálculo.

### ADR-V3-5: PR refs vía refspec (o SHAs del snapshot si existen)
**Decisión:** `+refs/pull/*/head:refs/pull/*/head` en el mirror. **Razón:** prerrequisito
P1; sin pull-refs el collector recibe vacío (F-1). Si el runtime empieza a exponer
`head_sha`/`base_sha`, migrar a esos (menos dependencia del mirror).

### ADR-V3-6: Degrade graceful sin git / sin hunks
**Decisión:** sin git → predicciones vacías + UI lo indica; sin hunks → file-level con
pesos redistribuidos. **Razón:** ZooDash corre en entornos sin git (CI, Docker minimal);
la predicción es un enriquecimiento, no un requisito duro.

### ADR-V3-7: Backtest sintético primario, histórico best-effort
**Decisión:** la validación principal es un generador sintético determinista; el backtest
histórico es complementario y limitado por retención de refs. **Razón:** `event_log` no
guarda diffs históricos (F-3); reconstruir el pasado real es best-effort. Lo sintético es
reproducible y suficiente para calibrar y para CI.

### ADR-V3-8: Dos `kind` de predicción
**Decisión:** `pr_pr` (entre PRs) y `pr_base` (deriva contra main), ambos materializados.
**Razón:** cubren las dos formas reales de choque latente; separarlos permite alertar y
medir cada una por separado.

---

## 10. Migración (v1.4.0 → v3, por fases)

```
v3.0  Schema (pr_changed_file, pr_changed_hunk) + db.ts init  [sin breaking changes]
      + Fase 0: refspec PR refs, collector, reconciliación, collectorStatus, tests
v3.1  conflict_prediction + projector overlap (file-level + zone prior) + db.ts init
v3.2  pr_changed_hunk poblado + overlap de líneas + confirmación merge-tree top-K
v3.3  regla predicted_conflict (alerting) + GET /api/predictions + vista
v3.4  prediction_backtest + arnés sintético + backtest histórico + calibración de pesos
v3.5  (opcional) contributor-overlap, pesos ML, correlación CI
```

**Reversibilidad:** cada tabla es `CREATE TABLE IF NOT EXISTS`; rollback = `DROP TABLE` +
revertir collector/projector/endpoint/vista. Backward compatible: `/api/conflicts`
mantiene su forma; `predicted` es aditivo y opcional.

---

## 11. Criterios de aceptación

| # | Criterio | Verificación |
|---|---|---|
| 1 | **(P1)** Mirror resuelve `refs/pull/<n>/head` reales | `git rev-parse` en test de integración |
| 2 | **(P2)** Collector captura archivos por PR vía `git diff` | repo sembrado con 2 ramas → `pr_changed_file` correcto |
| 3 | **(P4)** Reconciliación: PR cerrado desaparece al siguiente ciclo | sembrar, cerrar, recolectar, verificar ausencia |
| 4 | Overlap engine genera `conflict_pr_pr` con archivos solapados | golden-input → predicción esperada |
| 5 | Sin overlap → no se crea fila | dos PRs disjuntos → 0 predicciones |
| 6 | Probabilidad y nivel clasifican según fórmula §4.3 | test unitario importando la fórmula real (no copia) |
| 7 | Zone prior se aplica desde `conflict_heat` (V2.i) | sembrar heat → verificar `zone_weight` en predicción |
| 8 | Hunk overlap eleva la probabilidad (v3.2) | mismo par con/sin solape de líneas |
| 9 | Confirmación merge-tree marca `confirmed=1` (v3.2) | par con conflicto real sembrado |
| 10 | Regla `predicted_conflict` genera alerta + decision_log | evaluar reglas, verificar `alert` + `decision_log` |
| 11 | `/api/predictions` devuelve forma correcta + `collectorStatus` | E2E |
| 12 | **(no-daño)** `git -C <fork> status` limpio tras todo | script de verificación obligatorio |
| 13 | Degrade sin git → predicciones vacías, UI lo indica | desinstalar git temporalmente en test |
| 14 | **(determinismo)** mismo input → mismo `conflict_prediction` | golden-input ejecutado N veces |
| 15 | Backtest reporta precision/recall/lead-time | arnés sintético verde + número publicado |
| 16 | Build + tests (TS **y** Python) pasan | `pnpm build && pnpm test && pnpm test:py` |
| 17 | Docs + CHANGELOG actualizados | este dossier + entrada |

---

## 12. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mirror sin PR refs (heredado F-1) | Alta si no se hace Fase 0 | Crítico | P1 es la primera tarea; test #1 lo bloquea |
| Falsos positivos molestos (tocar el mismo archivo ≠ chocar) | Alta | Medio | hunk overlap (v3.2) + zone prior + cooldown + umbral calibrado por backtest |
| Explosión O(P²) con muchos PRs abiertos | Baja (repo en freeze) | Medio | solo pares con overlap generan fila; confirmación acotada a top-K |
| `git diff` formato/rename detection variable entre versiones | Media | Medio | fijar git ≥2.38, `-M -z`, parser tolerante, tests con 2 versiones |
| Predicciones no event-sourced rompen el relato de determinismo | Media | Medio | ADR-V3-3 explícito + golden-input tests (no fingir replay) |
| Sin diffs históricos para backtest real | Alta | Bajo | ADR-V3-7: sintético primario; histórico best-effort |
| Fork mutado accidentalmente | Muy baja | Crítico | test no-daño obligatorio (#12); mirror en directorio separado |
| Linkage frágil con conflict_lifecycle (heredado F-13) | Media | Bajo | predicción no depende de `conflict_id`; usa `pr_number` directo |

---

## 13. Ejecución recomendada

```
v3.0 (fundación/mirror/collector) → code+devops   (~2.5 h)   ← incluye saldar P1–P6
v3.1 (overlap engine + projector)  → code mode      (~1.5 h)
v3.2 (hunks + confirmación)        → code mode      (~1.5 h)
v3.3 (alerting + endpoint + vista) → code mode      (~2 h)
v3.4 (backtest + calibración)      → tester mode    (~2 h)
```

**Total estimado:** ~9.5 h (sin v3.5). v3.0 es la fase de mayor valor de deuda saldada:
arregla la tubería de V2.i **y** funda v3.

---

## 14. Post-v3: qué se desbloquea

- **Coordinación proactiva:** "mergea #A antes que #B, o resuelve el solape ahora".
- **Predicción → realidad (lazo cerrado):** medir lead-time real cuando el `pr.conflict`
  llega, alimentando `became_conflicting_at`/`lead_time_seconds` y recalibrando pesos.
- **Contributor-overlap (v3.5):** qué personas trabajan sobre las mismas zonas a la vez.
- **Pesos aprendidos (v3.5):** ML sobre las etiquetas del backtest, manteniendo la
  explicabilidad como restricción.
- **Sugerencia de orden de merge:** ordenar la cola de PRs para minimizar conflictos
  totales (problema de scheduling sobre el grafo de solapamiento).

