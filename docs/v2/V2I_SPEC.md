# ZooDash V2.i — Conflict Tracker Fase B — Conflict Files, Heat Graph & Age Risk

> **Estado:** ✅ Implementado (v1.4.0 — 2026-05-30).
> **Autoridad:** Este documento define V2.i completo: archivos en conflicto por `git merge-tree`,
> Conflict Heat Graph (mapa de zonas), Conflict Age Risk (priorización) y migración.
> Suplementa [ARCHITECTURE.md](./ARCHITECTURE.md) (ADR-6),
> [FEATURES.md](./FEATURES.md) (F-C), [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md) §10,
> [TESTING_AND_SIMULATION.md](./TESTING_AND_SIMULATION.md) §5 y [V2H_SPEC.md](./V2H_SPEC.md).
>
> **Normativo:** El clon read-only es **sagrado** — solo `git fetch` y `git merge-tree`.
> Nunca se escribe en el clon ni en el fork de trabajo. Violaciones son bugs bloqueantes.
>
> **Prerrequisito:** V2.h (Event Store + Replay Engine) — ya cerrado (v1.3.0).
> V2.i construye sobre el event_log, los projectors deterministas y el replay verificado.

---

## 0. Contexto y tesis

V2.f (Fase A) cerró la capa temporal de conflictos:

```
event_log → conflict_lifecycle (entered/resolved)
          → conflict_trajectory (pressure model)
          → conflict_hotspot (simplificado: PR# como "path")
          → GET /api/conflicts + vista /conflicts
```

V2.h cerró la infraestructura de replay:

```
event_log → replay engine (determinista)
          → parity checker (structural + semantic)
          → decision log (trazabilidad)
```

**Lo que V2.f NO resuelve:** el `conflict_hotspot` actual usa `PR#N` como "path" — no
sabemos **qué archivos** causan los conflictos. Sin archivos reales, no podemos:

1. Identificar zonas calientes del repo (`src/runtime/*` vs `src/ui/*`)
2. Priorizar qué conflicto atacar primero (age × files × zone)
3. Correlacionar conflictos con ownership/contributors por zona

**Tesis de V2.i:** `git merge-tree <base> <head>` sobre un clon read-only dedicado
proporciona los archivos en conflicto **sin tocar el fork de trabajo**. Esto desbloquea
hotspots reales, heat graph por zona y age risk scoring.

### 0.1 Pipeline V2.i completo

```
PR con mergeable=CONFLICTING
  │
  ├─ enricher (Python): git fetch + merge-tree → conflict_file
  │     └─ sobre clon read-only ~/.cache/zoodash/repo.git
  │
  ├─ projector (TypeScript): conflict_file → conflict_hotspot (reales)
  │     └─ DELETE + INSERT idempotente (patrón V2.h)
  │
  ├─ aggregator: conflict_hotspot → conflict_heat (por zona)
  │
  ├─ scoring: conflict_lifecycle + conflict_file → age_risk_score
  │
  └─ endpoint: GET /api/conflicts → open + files + hotspots + heat + ageRisk
```

---

## 1. Schema — Tablas nuevas y modificaciones

### 1.1 `conflict_file` — Archivos en conflicto por PR

Cada fila = un archivo que `git merge-tree` reporta como conflicto para un PR.

```sql
-- conflict_file (V2.i) — archivos reales en conflicto por PR.
-- Origen: enricher Python ejecuta git merge-tree sobre clon read-only.
CREATE TABLE IF NOT EXISTS conflict_file (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pr_number       INTEGER NOT NULL,
    file_path       TEXT NOT NULL,              -- ruta relativa del archivo (p.ej. src/lib/db.ts)
    conflict_id     TEXT NOT NULL,              -- FK lógico a conflict_lifecycle.id
    detected_at     TEXT NOT NULL,              -- ISO-8601 UTC: cuándo se detectó el conflicto
    resolved_at     TEXT,                       -- ISO-8601 UTC: cuándo se resolvió (NULL si abierto)
    UNIQUE(pr_number, file_path, conflict_id)   -- idempotencia
);
CREATE INDEX IF NOT EXISTS idx_cf_pr ON conflict_file(pr_number);
CREATE INDEX IF NOT EXISTS idx_cf_path ON conflict_file(file_path, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cf_resolved ON conflict_file(resolved_at);
```

### 1.2 `conflict_hotspot` — Actualización para paths reales

La tabla existente (`path` como PK) se mantiene. V2.i cambia el **contenido** de `path`:
de `PR#N` (V2.f) a rutas reales de archivo (p.ej. `src/lib/db.ts`).

```sql
-- conflict_hotspot ya existe en schema.sql.
-- V2.i: el projector ahora inserta rutas reales en lugar de PR#N.
-- Migración: DELETE + re-proyectar desde conflict_file.
-- No se altera la estructura de la tabla.
```

### 1.3 `conflict_heat` — Agregación por zona

Agregaciones precalculadas por zona del repo para el Heat Graph.

```sql
-- conflict_heat (V2.i) — agregación por zona del repo para Heat Graph.
-- Zona = prefijo de ruta normalizado (p.ej. "src/lib", "src/app", "ingest").
CREATE TABLE IF NOT EXISTS conflict_heat (
    zone            TEXT PRIMARY KEY,           -- prefijo de ruta normalizado
    file_count      INTEGER NOT NULL DEFAULT 0, -- nº de archivos únicos en conflicto
    conflict_count  INTEGER NOT NULL DEFAULT 0, -- nº total de conflictos (suma de appearances)
    last_conflict   TEXT,                       -- ISO-8601 UTC: último conflicto en esta zona
    score           REAL NOT NULL DEFAULT 0,    -- peso normalizado (0–1) para visualización
    refreshed_at    TEXT NOT NULL,              -- ISO-8601 UTC
    UNIQUE(zone)
);
```

### 1.4 `conflict_age_risk` — Scoring de priorización

```sql
-- conflict_age_risk (V2.i) — scoring por PR para priorización.
-- Combina: duración del conflicto + nº de archivos + zona(s).
CREATE TABLE IF NOT EXISTS conflict_age_risk (
    pr_number       INTEGER PRIMARY KEY,
    age_days        REAL NOT NULL DEFAULT 0,    -- duración en días (0 si resuelto)
    file_count      INTEGER NOT NULL DEFAULT 0, -- nº de archivos en conflicto
    zone_score      REAL NOT NULL DEFAULT 0,    -- peso de las zonas afectadas
    risk_score      REAL NOT NULL DEFAULT 0,    -- score compuesto (0–100)
    risk_level      TEXT NOT NULL DEFAULT 'low', -- low | medium | high | critical
    refreshed_at    TEXT NOT NULL,
    UNIQUE(pr_number)
);
```

---

## 2. Enricher — Módulo Python (`ingest/conflict_enricher.py`)

### 2.1 Tesis

GitHub no expone los archivos en conflicto de un PR de forma directa.
`git merge-tree <base> <head>` calcula los archivos en conflicto **localmente**,
sin necesidad de hacer checkout ni modificar ningún working tree.

El enricher es un script Python (patrón de [`historian.py`](ingest/historian.py)) que:

1. Consulta la DB para PRs con `mergeable=CONFLICTING` (eficiencia)
2. Actualiza el mirror read-only con `git fetch`
3. Ejecuta `git merge-tree` sobre el mirror
4. Parsea la salida → inserta en `conflict_file`

### 2.2 Clon read-only

| Propiedad | Valor |
|---|---|
| Ubicación | `~/.cache/zoodash/repo.git` (configurable vía `ZOODASH_REPO_MIRROR`) |
| Tipo | `git clone --mirror` (bare repo) |
| Operaciones permitidas | `git fetch origin`, `git merge-tree` |
| Operaciones prohibidas | `checkout`, `push`, `commit`, **cualquier escritura** |
| Actualización | `git fetch origin` antes de cada batch de merge-tree |
| Verificación | `git -C <mirror> status` siempre limpio (test de aceptación) |

> **ADR-V2I-1:** El mirror es un directorio **distinto** al fork de trabajo
> (`Zoo-Code-contrib`). Nunca se toca el fork. Si el mirror no existe, el enricher
> lo crea con `git clone --mirror`. Si `git` no está disponible, **degrada gracefully**
> (conflict_file vacío, hotspots siguen usando PR#N como fallback).

### 2.3 Contract

```python
# ingest/conflict_enricher.py

from __future__ import annotations
from pathlib import Path
from typing import TypedDict

class ConflictFile(TypedDict):
    pr_number: int
    file_path: str
    conflict_id: str
    detected_at: str

class EnricherResult(TypedDict):
    prs_enriched: int
    files_detected: int
    errors: list[str]
    mirror_updated: bool

def ensure_mirror(mirror: Path, repo_url: str) -> None:
    """Clona el mirror si no existe. Idempotente."""
    ...

def update_mirror(mirror: Path) -> None:
    """git fetch origin sobre el mirror. Read-only."""
    ...

def parse_merge_tree(output: str) -> list[str]:
    """Parsea la salida de git merge-tree → lista de file_paths en conflicto."""
    ...

def get_conflicting_prs(db_path: Path) -> list[dict]:
    """PRs con mergeable=CONFLICTING del último poll. Optimización."""
    ...

def get_merge_refs(mirror: Path, pr_number: int) -> tuple[str, str] | None:
    """Obtiene (base_sha, head_sha) para un PR. Usa GitHub API o refspec."""
    ...

def enrich_conflicts(db_path: Path, mirror: Path, repo_url: str) -> EnricherResult:
    """Entry point: fetch + merge-tree para cada PR conflicting + insert conflict_file."""
    ...
```

### 2.4 Algoritmo

```python
def enrich_conflicts(db_path: Path, mirror: Path, repo_url: str) -> EnricherResult:
    result: EnricherResult = {
        "prs_enriched": 0, "files_detected": 0, "errors": [], "mirror_updated": False,
    }

    # 1. Asegurar mirror
    ensure_mirror(mirror, repo_url)

    # 2. Fetch (una vez por batch)
    try:
        update_mirror(mirror)
        result["mirror_updated"] = True
    except subprocess.CalledProcessError as e:
        result["errors"].append(f"fetch failed: {e}")
        return result  # sin fetch, no podemos hacer merge-tree

    # 3. Obtener PRs conflicting
    conflicting = get_conflicting_prs(db_path)
    if not conflicting:
        return result

    # 4. Para cada PR, merge-tree
    conn = sqlite3.connect(str(db_path))
    for pr in conflicting:
        pr_num = pr["number"]
        refs = get_merge_refs(mirror, pr_num)
        if not refs:
            result["errors"].append(f"PR#{pr_num}: no refs found")
            continue

        base, head = refs
        try:
            output = subprocess.check_output(
                ["git", "-C", str(mirror), "merge-tree", base, head],
                text=True, stderr=subprocess.DEVNULL,
            )
            files = parse_merge_tree(output)
        except subprocess.CalledProcessError:
            # merge-tree puede fallar si los refs no existen → skip
            result["errors"].append(f"PR#{pr_num}: merge-tree failed")
            continue

        now = now_iso()
        conflict_id = find_active_conflict_id(conn, pr_num)
        for fpath in files:
            conn.execute(
                """INSERT OR IGNORE INTO conflict_file
                   (pr_number, file_path, conflict_id, detected_at)
                   VALUES (?, ?, ?, ?)""",
                (pr_num, fpath, conflict_id, now),
            )
            result["files_detected"] += 1

        result["prs_enriched"] += 1

    conn.commit()
    conn.close()
    return result
```

### 2.5 Parser de `git merge-tree`

`git merge-tree` produce texto con marcadores de conflicto. El parser extrae
los paths de los archivos que tienen conflictos:

```python
import re

# Patrón de la salida de git merge-tree:
#   changed in both
#    base   100644 <sha> <path>
#    our    100644 <sha> <path>
#    their  100644 <sha> <path>
# También puede haber:
#   CONFLICT (content): Merge conflict in <path>

MERGE_TREE_CONFLICT_RE = re.compile(
    r"CONFLICT\s*\(.*?\):\s*Merge conflict in\s+(.+)",
    re.MULTILINE,
)
MERGE_TREE_CHANGED_BOTH_RE = re.compile(
    r"changed in both\s*\n\s+base\s+\d+\s+\S+\s+(.+)",
    re.MULTILINE,
)

def parse_merge_tree(output: str) -> list[str]:
    """Extrae paths de archivos en conflicto de la salida de git merge-tree."""
    paths: set[str] = set()
    for m in MERGE_TREE_CONFLICT_RE.finditer(output):
        paths.add(m.group(1).strip())
    for m in MERGE_TREE_CHANGED_BOTH_RE.finditer(output):
        paths.add(m.group(1).strip())
    return sorted(paths)
```

### 2.6 Integración con historian

El enricher se ejecuta **después** del historian en el mismo ciclo de polling:

```bash
# En el cron/launchd del historian:
python3 ingest/historian.py
python3 ingest/conflict_enricher.py  # solo si git disponible + hay conflicting PRs
```

Si `git` no está disponible o `ZOODASH_REPO_MIRROR` no está configurado, el enricher
**no falla** — simplemente no escribe `conflict_file`. Los hotspots degradan al
comportamiento de V2.f (PR#N como path).

---

## 3. Projector — TypeScript (`src/lib/projector/conflict-file.ts`)

### 3.1 Tesis

El enricher Python escribe `conflict_file`. El projector TypeScript (patrón de
[`conflict-lifecycle.ts`](src/lib/projector/conflict-lifecycle.ts) y
[`conflict-hotspot.ts`](src/lib/projector/conflict-hotspot.ts)) proyecta estos datos a:

1. `conflict_hotspot` — con paths reales (reemplaza PR#N)
2. `conflict_heat` — agregaciones por zona
3. `conflict_age_risk` — scoring de priorización

### 3.2 Contract

```typescript
// src/lib/projector/conflict-file.ts

import type Database from "better-sqlite3";

/** Refresca conflict_hotspot con paths reales desde conflict_file. */
export function refreshConflictFileHotspots(db: Database.Database): number;

/** Refresca conflict_heat (agregaciones por zona). */
export function refreshConflictHeat(db: Database.Database): number;

/** Refresca conflict_age_risk (scoring por PR). */
export function refreshConflictAgeRisk(db: Database.Database): number;

/** Ejecuta los tres refreshers en orden. Útil para replay. */
export function projectConflictFiles(db: Database.Database): {
  hotspots: number;
  heat: number;
  ageRisk: number;
};
```

### 3.3 Refresh de hotspots con paths reales

```typescript
export function refreshConflictFileHotspots(db: Database.Database): number {
  // 1. Limpiar hotspots actuales (DELETE + INSERT = idempotente, patrón V2.h)
  db.prepare("DELETE FROM conflict_hotspot").run();

  // 2. Agregar conflict_file → hotspot por path
  const rows = db.prepare(`
    SELECT file_path AS path,
           COUNT(*) AS times,
           MAX(detected_at) AS last_seen
    FROM conflict_file
    WHERE resolved_at IS NULL  -- solo conflictos activos
    GROUP BY file_path
    ORDER BY times DESC
  `).all() as Array<{ path: string; times: number; last_seen: string }>;

  const upsert = db.prepare(`
    INSERT INTO conflict_hotspot (path, times, last_seen, schema_version)
    VALUES (?, ?, ?, 2)
    ON CONFLICT(path) DO UPDATE SET
      times = excluded.times,
      last_seen = excluded.last_seen,
      schema_version = 2
  `);

  const txn = db.transaction(() => {
    for (const r of rows) {
      upsert.run(r.path, r.times, r.last_seen);
    }
  });
  txn();

  return rows.length;
}
```

### 3.4 Fallback V2.f → V2.i

Si `conflict_file` está vacío (enricher no corrió o git no disponible),
el projector cae al comportamiento V2.f:

```typescript
export function refreshConflictFileHotspots(db: Database.Database): number {
  db.prepare("DELETE FROM conflict_hotspot").run();

  const hasFiles = db.prepare(
    "SELECT COUNT(*) AS c FROM conflict_file"
  ).get() as { c: number };

  if (hasFiles.c === 0) {
    // Fallback: usar PR#N como path (comportamiento V2.f)
    return refreshConflictHotspotLegacy(db);
  }

  // ... proyección real con paths ...
}
```

---

## 4. Heat Graph — Agregación por zona

### 4.1 Definición de zona

Una **zona** es el prefijo de ruta normalizado a 2 niveles:

| `file_path` | `zone` |
|---|---|
| `src/lib/db.ts` | `src/lib` |
| `src/app/api/conflicts/route.ts` | `src/app` |
| `ingest/historian.py` | `ingest` |
| `deploy/launchd/com.zoodash.historian.plist` | `deploy` |
| `docs/v2/V2I_SPEC.md` | `docs` |
| `package.json` | `(root)` |

Regla: `zone = "/".join(path.split("/")[:2])` si tiene ≥2 segmentos, sino `(root)`.

### 4.2 Agregación

```typescript
function normalizeZone(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length >= 2) return parts.slice(0, 2).join("/");
  return "(root)";
}

export function refreshConflictHeat(db: Database.Database): number {
  db.prepare("DELETE FROM conflict_heat").run();

  const zones = db.prepare(`
    SELECT
      zone,
      COUNT(DISTINCT file_path) AS file_count,
      COUNT(*) AS conflict_count,
      MAX(detected_at) AS last_conflict
    FROM (
      SELECT file_path,
             CASE
               WHEN instr(file_path, '/') > 0 THEN
                 substr(file_path, 1, instr(substr(file_path, instr(file_path, '/') + 1), '/') + instr(file_path, '/') - 1)
               ELSE '(root)'
             END AS zone,
             detected_at
      FROM conflict_file
      WHERE resolved_at IS NULL
    )
    GROUP BY zone
    ORDER BY conflict_count DESC
  `).all() as Array<{
    zone: string; file_count: number; conflict_count: number; last_conflict: string;
  }>;

  const maxCount = zones[0]?.conflict_count ?? 1;
  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO conflict_heat (zone, file_count, conflict_count, last_conflict, score, refreshed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    for (const z of zones) {
      const score = Math.round((z.conflict_count / maxCount) * 100) / 100;
      upsert.run(z.zone, z.file_count, z.conflict_count, z.last_conflict, score, now);
    }
  });
  txn();

  return zones.length;
}
```

### 4.3 Visualización

El Heat Graph se muestra como una tabla visual en `/conflicts`:

```
Zona                Archivos  Conflictos  Barra
─────────────────────────────────────────────────
src/lib                 5        12       ████████████████
src/app                 3         8       ██████████
ingest                  2         4       █████
docs                    1         2       ██
(root)                  1         1       █
```

La **barra** se renderiza proporcionalmente al `score` (0–1).

---

## 5. Age Risk — Scoring de priorización

### 5.1 Fórmula

```
risk_score = (age_days × 0.4) + (file_count_normalized × 0.3) + (zone_weight × 0.3)

Donde:
  age_days              = (now - detected_at) / 86400
  file_count_normalized = min(file_count / max_file_count, 1.0) × 100
  zone_weight           = max(zone.score) de las zonas afectadas × 100
```

### 5.2 Niveles de riesgo

| `risk_score` | `risk_level` | Interpretación |
|---|---|---|
| 0–25 | `low` | Conflicto reciente, pocos archivos |
| 26–50 | `medium` | Envejeciendo o archivos moderados |
| 51–75 | `high` | Antiguo + muchos archivos o zona crítica |
| 76–100 | `critical` | Conflicto viejo, muchos archivos, zona caliente |

### 5.3 Implementación

```typescript
export function refreshConflictAgeRisk(db: Database.Database): number {
  db.prepare("DELETE FROM conflict_age_risk").run();

  // PRs con conflicto activo
  const openConflicts = db.prepare(`
    SELECT cl.pr_number, cl.detected_at,
           COUNT(cf.file_path) AS file_count
    FROM conflict_lifecycle cl
    LEFT JOIN conflict_file cf ON cf.pr_number = cl.pr_number AND cf.conflict_id = cl.id
    WHERE cl.state = 'entered'
    GROUP BY cl.pr_number
  `).all() as Array<{ pr_number: number; detected_at: string; file_count: number }>;

  if (openConflicts.length === 0) return 0;

  const maxFiles = Math.max(...openConflicts.map(c => c.file_count), 1);
  const now = Date.now();

  // Obtener peso máximo de zona por PR
  const zoneWeights = db.prepare(`
    SELECT cf.pr_number, MAX(ch.score) AS max_zone_score
    FROM conflict_file cf
    JOIN conflict_heat ch ON ch.zone = CASE
      WHEN instr(cf.file_path, '/') > 0 THEN
        substr(cf.file_path, 1, instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') + instr(cf.file_path, '/') - 1)
      ELSE '(root)'
    END
    WHERE cf.resolved_at IS NULL
    GROUP BY cf.pr_number
  `).all() as Array<{ pr_number: number; max_zone_score: number }>;

  const zoneMap = new Map(zoneWeights.map(z => [z.pr_number, z.max_zone_score]));

  const upsert = db.prepare(`
    INSERT INTO conflict_age_risk
      (pr_number, age_days, file_count, zone_score, risk_score, risk_level, refreshed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    for (const c of openConflicts) {
      const ageDays = (now - Date.parse(c.detected_at)) / 86_400_000;
      const fileNorm = (c.file_count / maxFiles) * 100;
      const zoneW = (zoneMap.get(c.pr_number) ?? 0) * 100;
      const score = Math.min(100, Math.round(
        (ageDays * 0.4) + (fileNorm * 0.3) + (zoneW * 0.3)
      ));
      const level =
        score >= 76 ? "critical" :
        score >= 51 ? "high" :
        score >= 26 ? "medium" : "low";

      upsert.run(c.pr_number, ageDays, c.file_count, zoneW, score, level, new Date().toISOString());
    }
  });
  txn();

  return openConflicts.length;
}
```

---

## 6. Endpoint — `GET /api/conflicts` enriquecido

### 6.1 Response shape

```typescript
// Ampliación del endpoint existente (src/app/api/conflicts/route.ts)

interface ConflictFileEntry {
  path: string;
  detectedAt: string;
  resolvedAt: string | null;
}

interface ConflictEntry {
  prNumber: number;
  title: string;
  state: string;
  detectedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  files: ConflictFileEntry[];       // NUEVO V2.i
  ageRisk: AgeRiskEntry | null;     // NUEVO V2.i
}

interface HotspotEntry {
  path: string;                     // ruta real (V2.i) o PR#N (V2.f fallback)
  times: number;
  lastSeen: string;
}

interface HeatZoneEntry {
  zone: string;                     // p.ej. "src/lib"
  fileCount: number;
  conflictCount: number;
  score: number;                    // 0–1
}

interface AgeRiskEntry {
  prNumber: number;
  ageDays: number;
  fileCount: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface ConflictsResponse {
  ok: boolean;
  open: ConflictEntry[];
  resolved: ConflictEntry[];
  hotspots: HotspotEntry[];
  heat: HeatZoneEntry[];            // NUEVO V2.i
  ageRisk: AgeRiskEntry[];          // NUEVO V2.i
  enricherStatus: {                 // NUEVO V2.i
    lastRun: string | null;
    mirrorOk: boolean;
    filesTracked: number;
  };
}
```

### 6.2 Query SQL

```sql
-- Archivos por conflicto abierto
SELECT cf.file_path, cf.detected_at, cf.resolved_at
FROM conflict_file cf
JOIN conflict_lifecycle cl ON cl.id = cf.conflict_id
WHERE cl.state = 'entered' AND cl.pr_number = ?
ORDER BY cf.detected_at;

-- Heat zones
SELECT zone, file_count, conflict_count, score
FROM conflict_heat
ORDER BY conflict_count DESC;

-- Age risk
SELECT pr_number, age_days, file_count, risk_score, risk_level
FROM conflict_age_risk
ORDER BY risk_score DESC;
```

---

## 7. Vista — Actualización de `/conflicts`

### 7.1 Cambios en la página

La página [`/conflicts`](src/app/conflicts/page.tsx) se actualiza con:

1. **Tabla de hotspots con archivos reales** — en lugar de `PR#N`, muestra rutas
   de archivo con badge de frecuencia
2. **Heat Graph** — tabla visual de zonas con barras proporcionales
3. **Age Risk badges** — junto a cada conflicto abierto, badge de nivel de riesgo
   (reusa [`AgingBadge`](src/components/AgingBadge.tsx) con colores: green/yellow/orange/red)
4. **Archivos por conflicto** — expandible: al hacer click en un PR conflictivo,
   se muestran los archivos afectados

### 7.2 Componentes nuevos

| Componente | Propósito |
|---|---|
| `ConflictFileTable` | Tabla de hotspots con paths reales + frecuencia |
| `HeatGraph` | Visualización de zonas con barras proporcionales |
| `AgeRiskBadge` | Badge coloreado según nivel de riesgo |
| `ConflictFileList` | Lista expandible de archivos por PR |

### 7.3 Realtime

`queryKey: ["conflicts"]` — ya existe. V2.i amplía la response shape;
TanStack Query invalida automáticamente al recibir `changed { entity: "conflicts" }`.

---

## 8. Testing

### 8.1 Pirámide de pruebas V2.i

| Nivel | Qué | Herramienta | Dónde |
|---|---|---|---|
| **Unit** | `parse_merge_tree()` (parser de salida), `normalizeZone()`, cálculo de `risk_score`, fallback V2.f | **vitest** (TS) + **pytest** (Python) | rápido, sin infra |
| **Integración** | enricher → DB → projector → hotspots/heat/ageRisk | repo git temporal con conflicto sembrado | `sim/seed_conflict.sh` |
| **E2E** | endpoint `/api/conflicts` con archivos + heat + ageRisk; vista `/conflicts` | **Playwright** | navegador headless |
| **No-daño** | `git -C <fork> status` limpio tras toda simulación | script | verificación |

### 8.2 Test: `mergeTreeParse.test.ts`

```typescript
// src/lib/__tests__/merge-tree-parse.test.ts
import { describe, it, expect } from "vitest";
import { parseMergeTreeOutput } from "@/lib/conflict/merge-tree-parser";

describe("parseMergeTreeOutput", () => {
  it("extrae paths de CONFLICT (content)", () => {
    const output = `
CONFLICT (content): Merge conflict in src/lib/db.ts
CONFLICT (content): Merge conflict in src/app/api/conflicts/route.ts
    `;
    expect(parseMergeTreeOutput(output)).toEqual([
      "src/app/api/conflicts/route.ts",
      "src/lib/db.ts",
    ]);
  });

  it("extrae paths de 'changed in both'", () => {
    const output = `
changed in both
  base   100644 abc123 src/lib/db.ts
  our    100644 def456 src/lib/db.ts
  their  100644 ghi789 src/lib/db.ts
    `;
    expect(parseMergeTreeOutput(output)).toEqual(["src/lib/db.ts"]);
  });

  it("retorna vacío si no hay conflictos", () => {
    expect(parseMergeTreeOutput("")).toEqual([]);
    expect(parseMergeTreeOutput("some output without conflicts")).toEqual([]);
  });

  it("deduplica paths repetidos", () => {
    const output = `
CONFLICT (content): Merge conflict in src/lib/db.ts
changed in both
  base   100644 abc123 src/lib/db.ts
    `;
    expect(parseMergeTreeOutput(output)).toEqual(["src/lib/db.ts"]);
  });
});
```

### 8.3 Test: Simulador de conflictos git

[`sim/seed_conflict.sh`](docs/v2/TESTING_AND_SIMULATION.md#5-simulador-3--conflictos-git-para-merge-tree) (ya definido en TESTING §5):

```bash
# Crear repo temporal con conflicto controlado
set -e
d=$(mktemp -d); cd "$d"; git init -q
printf 'linea1\nlinea2\n' > f.txt; git add f.txt; git commit -qm base
git switch -qc feat; printf 'linea1\nFEAT\n' > f.txt; git commit -qam feat
git switch -qc main2 main 2>/dev/null || git switch -q main
printf 'linea1\nMAIN\n' > f.txt; git commit -qam main-change
echo "=== merge-tree ==="
git merge-tree $(git merge-base main feat) main feat
echo "repo: $d"
```

**Prueba que valida:** `parse_merge_tree(output)` → `["f.txt"]`.

### 8.4 Test: enricher integración (Python)

```python
# tests/test_conflict_enricher.py
import tempfile, subprocess, sqlite3, os
from pathlib import Path
from ingest.conflict_enricher import parse_merge_tree, enrich_conflicts

def test_parse_merge_tree_conflict():
    output = "CONFLICT (content): Merge conflict in src/lib/db.ts\n"
    assert parse_merge_tree(output) == ["src/lib/db.ts"]

def test_parse_merge_tree_empty():
    assert parse_merge_tree("") == []
    assert parse_merge_tree("clean merge\n") == []

def test_enricher_end_to_end():
    """Crea repo con conflicto, ejecuta enricher, verifica conflict_file."""
    with tempfile.TemporaryDirectory() as td:
        # Setup repo con conflicto
        repo = Path(td) / "repo"
        # ... (usar seed_conflict logic) ...
        # Setup DB
        db_path = Path(td) / "test.db"
        # ... crear schema ...
        # Ejecutar enricher
        # Verificar conflict_file tiene filas
```

### 8.5 Test: age risk scoring (TypeScript)

```typescript
// src/lib/__tests__/age-risk.test.ts
import { describe, it, expect } from "vitest";

describe("riskLevel classification", () => {
  it("low: score < 26", () => {
    expect(classifyRisk(10)).toBe("low");
    expect(classifyRisk(25)).toBe("low");
  });
  it("medium: 26-50", () => {
    expect(classifyRisk(26)).toBe("medium");
    expect(classifyRisk(50)).toBe("medium");
  });
  it("high: 51-75", () => {
    expect(classifyRisk(51)).toBe("high");
    expect(classifyRisk(75)).toBe("high");
  });
  it("critical: 76-100", () => {
    expect(classifyRisk(76)).toBe("critical");
    expect(classifyRisk(100)).toBe("critical");
  });
});
```

### 8.6 Criterios de aceptación de pruebas

1. **Parser:** `parse_merge_tree()` extrae paths correctos de las 3 variantes de salida
2. **Enricher:** sobre repo con conflicto sembrado, `conflict_file` tiene los archivos correctos
3. **No-daño:** tras toda simulación, `git -C <fork> status` sigue limpio
4. **Fallback:** si `conflict_file` vacío, hotspots muestra PR#N (V2.f behavior)
5. **Heat:** zonas se agregan correctamente a 2 niveles de profundidad
6. **Age Risk:** score y level clasifican correctamente según fórmula
7. **Parity:** replay incluye `conflict_file`, `conflict_hotspot`, `conflict_heat`, `conflict_age_risk`
8. **Gate:** `pnpm test` + `pytest` verdes

---

## 9. Migración v1.3.0 → V2.i

### 9.1 Principios

- **Zero downtime:** el sistema sigue funcionando durante la migración
- **Backward compatible:** las APIs existentes no cambian (solo se amplían)
- **Reversible:** cada paso puede revertirse sin pérdida de datos
- **Idempotente:** re-ejecutar la migración es seguro

### 9.2 Pasos de migración

```
PASO 1: Schema (sin breaking changes)
  └─ CREATE TABLE conflict_file
  └─ CREATE TABLE conflict_heat
  └─ CREATE TABLE conflict_age_risk
  └─ CREATE INDEX ...
  └─ No toca tablas existentes

PASO 2: Crear enricher
  └─ ingest/conflict_enricher.py
  └─ Configurar ZOODASH_REPO_MIRROR en .env.local
  └─ Crear mirror: git clone --mirror <repo_url> $ZOODASH_REPO_MIRROR
  └─ No toca nada existente

PASO 3: Crear projector
  └─ src/lib/projector/conflict-file.ts
  └─ Integrar en projector/index.ts (refreshAll)
  └─ No toca projectors existentes

PASO 4: Ampliar endpoint
  └─ src/app/api/conflicts/route.ts → añadir files, heat, ageRisk
  └─ Backward compatible: campos nuevos son opcionales
  └─ Fallback: si tablas nuevas vacías, response V2.f funciona igual

PASO 5: Ampliar vista
  └─ src/app/conflicts/page.tsx → añadir HeatGraph, AgeRiskBadge, ConflictFileTable
  └─ Componentes nuevos (no modifican existentes)

PASO 6: Backfill (opcional)
  └─ Ejecutar enricher para PRs resueltos recientes (últimos 30 días)
  └─ Re-proyectar hotspots, heat y age risk
  └─ Idempotente: DELETE + re-proyectar

PASO 7: Integrar en cron
  └─ Añadir conflict_enricher.py al pipeline del historian
  └─ Ejecutar después de historian.py en el mismo ciclo

PASO 8: Verificar paridad
  └─ Ejecutar replay → verificar conflict_file, conflict_hotspot,
     conflict_heat, conflict_age_risk se reconstruyen
  └─ Verificar parity checker incluye las nuevas tablas
```

### 9.3 Rollback

Cada paso es independiente:
- Paso 1: DROP TABLE conflict_file, conflict_heat, conflict_age_risk
- Paso 2: eliminar conflict_enricher.py, desconfigurar mirror
- Paso 3: eliminar conflict-file.ts, revertir projector/index.ts
- Paso 4: revertir endpoint a versión V2.f
- Paso 5: eliminar componentes nuevos, revertir vista
- Paso 6: DELETE FROM conflict_file WHERE detected_at > <migstart>
- Paso 7: remover del cron

---

## 10. Decisiones de diseño (ADRs)

### ADR-V2I-1: Clon read-only dedicado (ADR-6 reaffirm)

**Contexto:** ¿Dónde ejecutamos `git merge-tree`?
**Decisión:** Mirror dedicado en `~/.cache/zoodash/repo.git`, **nunca** el fork de trabajo.
**Razón:** El fork es un workspace de desarrollo; cualquier mutación rompe al desarrollador.
El mirror es un bare repo que solo recibe `fetch` y responde a `merge-tree`. Separación
de concerns + seguridad operativa.

### ADR-V2I-2: Solo enricher para `mergeable=CONFLICTING`

**Contexto:** ¿Ejecutamos merge-tree para todos los PRs?
**Decisión:** Solo para PRs con `mergeable=CONFLICTING`.
**Razón:** `merge-tree` es costoso (fork + diff). Ejecutarlo para PRs MERGEABLE es
innecesario. La condición `mergeable=CONFLICTING` filtra el 95%+ de PRs.

### ADR-V2I-3: Enricher es Python, projector es TypeScript

**Contexto:** ¿Todo en un lenguaje?
**Decisión:** Enricher en Python (patrón `historian.py`), projector en TypeScript (patrón `conflict-lifecycle.ts`).
**Razón:** El enricher necesita `subprocess` para `git`, que es natural en Python y ya
tenemos el patrón con `historian.py`. El projector es TypeScript porque vive en `src/lib/`
y se integra con el replay engine (V2.h). Separar lenguajes separa responsabilidades.

### ADR-V2I-4: Degrade gracefully si git no disponible

**Contexto:** ¿Qué pasa si `git` no está en PATH o el mirror no existe?
**Decisión:** El enricher no falla — simplemente no escribe `conflict_file`.
Los hotspots degradan al comportamiento V2.f (PR#N como path).
**Razón:** ZooDash debe funcionar en entornos sin `git` (Docker minimal, CI).
La funcionalidad V2.i es un **enriquecimiento**, no un requisito.

### ADR-V2I-5: Zona = 2 niveles de profundidad

**Contexto:** ¿Cómo se define "zona" para el Heat Graph?
**Decisión:** `zone = "/".join(path.split("/")[:2])` — 2 niveles.
**Razón:** 1 nivel (`src`) es demasiado grueso. 3 niveles (`src/lib/projector`) es
demasiado fino. 2 niveles (`src/lib`) es el sweet spot: suficiente granularidad para
identificar áreas problemáticas sin fragmentar.

### ADR-V2I-6: Age Risk como tabla materializada

**Contexto:** ¿Calcular on-demand o materializar?
**Decisión:** Tabla `conflict_age_risk` materializada por el projector.
**Razón:** El scoring requiere joins entre `conflict_lifecycle`, `conflict_file` y
`conflict_heat`. On-demand sería costoso en cada request. Materializar sigue el
patrón de `contributor_summary` y `conflict_hotspot`.

### ADR-V2I-7: Read models V2.i son materializados, no event-sourced

**Contexto:** ¿Las tablas V2.i (`conflict_file`, `conflict_hotspot`, `conflict_heat`,
`conflict_age_risk`) participan en el replay de V2.h?
**Decisión:** **No.** Los read models de V2.i son **materializados no-event-sourced**.
`conflict_file` lo escribe el enricher Python (fuera del event_log), no hay eventos
`pr.conflict_file` en el event_log. El determinismo se garantiza como **función pura
de su input** (enricher output + `conflict_lifecycle`), no por replay de `event_log`.
**Razón:** Replay de V2.h reconstruye estado desde `event_log`. Los archivos en conflicto
provienen de `git merge-tree` sobre el mirror, que es una fuente externa al event_log.
Forzarlos al replay requeriría persistirlos como eventos, lo cual es innecesario dado que
el enricher es idempotente (DELETE+INSERT por ciclo). El parity checker V2.h no los
compara; su determinismo se verifica por separado (enricher → DB → projector es una
pipeline determinista si el mirror está actualizado).
**Corrección (post-review F-3):** Esta ADR originalmente afirmaba que replay incluía las
tablas V2.i. Eso era incorrecto: no se puede replay-ear lo que no está en event_log.

---

## 11. Archivos a crear/modificar

### Nuevos

| Archivo | Propósito |
|---|---|
| `ingest/conflict_enricher.py` | Enricher Python: git merge-tree sobre mirror |
| `src/lib/projector/conflict-file.ts` | Projector: conflict_file → hotspots + heat + ageRisk |
| `src/lib/conflict/merge-tree-parser.ts` | Parser de salida de git merge-tree (TS, compartido con tests) |
| `src/components/ConflictFileTable.tsx` | Tabla de hotspots con paths reales |
| `src/components/HeatGraph.tsx` | Visualización de zonas con barras |
| `src/components/AgeRiskBadge.tsx` | Badge de nivel de riesgo |
| `src/components/ConflictFileList.tsx` | Lista expandible de archivos por PR |
| `src/lib/__tests__/merge-tree-parse.test.ts` | Tests del parser |
| `src/lib/__tests__/age-risk.test.ts` | Tests del scoring |
| `tests/test_conflict_enricher.py` | Tests del enricher Python |
| `docs/v2/V2I_SPEC.md` | Este documento |

### Modificados

| Archivo | Cambio |
|---|---|
| `ingest/schema.sql` | Añadir CREATE TABLE conflict_file, conflict_heat, conflict_age_risk |
| `src/lib/db.ts` | Crear tablas nuevas si no existen (init) |
| `src/app/api/conflicts/route.ts` | Ampliar response con files, heat, ageRisk |
| `src/app/conflicts/page.tsx` | Añadir HeatGraph, AgeRiskBadge, ConflictFileTable |
| `src/lib/projector/index.ts` | Integrar refreshConflictFiles en el pipeline |
| `ingest/historian.py` | Opcional: llamar a conflict_enricher después del poll |

---

## 12. Criterios de aceptación

| # | Criterio | Verificación |
|---|---|---|
| 1 | `conflict_file` se crea y persiste correctamente | INSERT + SELECT manual |
| 2 | Enricher detecta archivos en conflicto de repo sembrado | Test integración con `seed_conflict.sh` |
| 3 | Hotspots muestran paths reales (no PR#N) cuando hay datos | Verificar `/api/conflicts` response |
| 4 | Fallback: hotspots muestran PR#N cuando `conflict_file` vacío | Verificar sin enricher |
| 5 | Heat Graph agrega por zona correctamente | Verificar zonas = 2 niveles |
| 6 | Age Risk clasifica correctamente (low/medium/high/critical) | Test unitario de scoring |
| 7 | Endpoint ampliado es backward compatible | `open` + `resolved` intactos |
| 8 | Vista muestra HeatGraph + AgeRiskBadge + ConflictFileTable | Playwright E2E |
| 9 | El fork de trabajo **no** se modifica | `git -C <fork> status` limpio |
| 10 | Mirror existe y solo tiene operaciones read-only | Verificar `git -C <mirror> status` |
| 11 | Degrade graceful: sin git → hotspots V2.f | Desinstalar git temporalmente en test |
| 12 | Replay incluye las nuevas tablas en parity check | Ejecutar verifyReplayIntegrity() |
| 13 | Build + tests pasan | `pnpm build && pnpm test && pytest` |
| 14 | Documentación actualizada | Este spec + CHANGELOG |

---

## 13. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| `git merge-tree` formato de salida cambia entre versiones de git | Media | Alto | Parser tolerante (regex múltiples patrones); test con git 2.30+ y 2.40+ |
| Mirror se corrompe o queda stale | Baja | Alto | `git fetch` antes de cada batch; recrear mirror si `fsck` falla |
| Enricher demasiado lento (>100 PRs conflicting) | Baja | Medio | Batch de 20 PRs por ejecución; rate limit; solo PRs nuevos/cambiados |
| Zone normalization inconsistente | Media | Bajo | Función única `normalizeZone()`, test exhaustivo |
| Age Risk score no refleja prioridad real | Media | Medio | Pesos ajustables (0.4/0.3/0.3); tuning post-deploy con feedback |
| Tablas nuevas crecen mucho | Baja | Bajo | Retención: `conflict_file` para PRs resueltos >90 días → DELETE |
| Parity checker no cubre nuevas tablas | Media | Alto | Extender parity-checker.ts antes de cerrar V2.i |
| Fork de trabajo mutado accidentalmente | Muy baja | Crítico | Test de no-daño obligatorio; mirror en directorio completamente separado |

---

## 14. Ejecución recomendada

```
PASO 1 (schema)           → devops mode    (~5 min)
PASO 2 (enricher)         → code mode      (~1 hora)
PASO 3 (projector)        → code mode      (~45 min)
PASO 4 (endpoint)         → code mode      (~30 min)
PASO 5 (vista)            → code mode      (~1 hora)
PASO 6 (backfill)         → devops mode    (~15 min)
PASO 7 (cron integration) → devops mode    (~10 min)
PASO 8 (parity)           → tester mode    (~30 min)
```

**Total estimado:** ~4.5 horas de implementación.

---

## 15. Post-V2.i: qué se desbloquea

Con V2.i cerrado (archivos reales + heat graph + age risk verificados):

- **v3 — Predictive Conflict:** detectar solapamiento de archivos modificados entre ramas **antes** de que GitHub marque CONFLICTING
- **Conflict ↔ Contributor correlation:** qué contributor toca las zonas calientes
- **Conflict ↔ CI correlation:** qué zonas tienen más CI failures
- **Time-travel de conflictos:** `replay(event_log, { to: "2026-05-15" })` → ver heat graph en el pasado
- **Alertas inteligentes:** alertar cuando una zona supera umbral de conflictos (nueva regla en alerting engine)