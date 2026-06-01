-- ============================================================================
-- ZooDash v3 — Predictive Conflict — Modelo de datos (SQLite)
-- ----------------------------------------------------------------------------
-- Estado: DISEÑO (no aplicar aún). Suplementa ingest/schema.sql.
-- Filosofía heredada de v2: read models MATERIALIZADOS por projector
-- (DELETE + INSERT por ciclo). NO event-sourced (ver ADR-V3-3 / review F-3):
-- el determinismo se garantiza como función pura del input, no por replay.
-- Timestamps en ISO-8601 UTC (texto), como el resto del esquema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pr_changed_file (v3.0) — archivos que cada PR abierto modifica vs su merge-base.
-- Origen: collector Python ejecuta `git diff --name-only base..head` sobre el
-- mirror read-only. Insumo PRIMARIO del overlap engine.
-- Reconciliación: DELETE de PRs ya no abiertos + re-INSERT por ciclo (P4).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pr_changed_file (
    pr_number     INTEGER NOT NULL,
    file_path     TEXT NOT NULL,              -- ruta relativa (p.ej. src/lib/db.ts)
    change_kind   TEXT NOT NULL DEFAULT 'M',  -- A(dd) | M(odify) | D(elete) | R(ename)
    additions     INTEGER NOT NULL DEFAULT 0, -- líneas añadidas (de --numstat; 0 si no disponible)
    deletions     INTEGER NOT NULL DEFAULT 0, -- líneas borradas
    base_sha      TEXT,                       -- merge-base(main, head) al momento de la captura
    head_sha      TEXT,                       -- refs/pull/<n>/head
    refreshed_at  TEXT NOT NULL,              -- ISO-8601 UTC del ciclo de captura
    PRIMARY KEY (pr_number, file_path)
);
CREATE INDEX IF NOT EXISTS idx_pcf_path ON pr_changed_file(file_path);
CREATE INDEX IF NOT EXISTS idx_pcf_pr ON pr_changed_file(pr_number);

-- ----------------------------------------------------------------------------
-- pr_changed_hunk (v3.2) — rangos de línea modificados por PR (precisión).
-- Origen: collector parsea `git diff -U0 base..head` (cabeceras @@ -a,b +c,d @@).
-- Opcional: si no se captura, el overlap cae a nivel archivo (degrade, ADR-V3-6).
-- start_line/end_line se refieren al lado NUEVO (post-imagen) del archivo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pr_changed_hunk (
    pr_number     INTEGER NOT NULL,
    file_path     TEXT NOT NULL,
    start_line    INTEGER NOT NULL,           -- primera línea del hunk (post-imagen)
    end_line      INTEGER NOT NULL,           -- última línea (start + count - 1)
    refreshed_at  TEXT NOT NULL,
    PRIMARY KEY (pr_number, file_path, start_line, end_line)
);
CREATE INDEX IF NOT EXISTS idx_pch_pr_file ON pr_changed_hunk(pr_number, file_path);

-- ----------------------------------------------------------------------------
-- conflict_prediction (v3.1) — predicción de choque latente, materializada.
-- kind = 'pr_pr'  : pr_a y pr_b se solapan entre sí (pr_b = NULL nunca aquí).
-- kind = 'pr_base': pr_a se solapa con cambios en main desde su merge-base
--                   (pr_b = NULL; el "otro lado" es la rama base).
-- Idempotente: DELETE + INSERT por ciclo. probability ∈ [0,1]; risk_score ∈ [0,100].
-- became_conflicting_at / lead_time_seconds se rellenan a posteriori (validación):
-- cuando el evento real pr.conflict aparece, se cierra el lazo para medir lead-time.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conflict_prediction (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    kind                 TEXT NOT NULL DEFAULT 'pr_pr',   -- pr_pr | pr_base
    pr_a                 INTEGER NOT NULL,                -- PR menor (orden canónico: pr_a < pr_b)
    pr_b                 INTEGER,                         -- PR mayor (NULL si kind='pr_base')
    shared_files         INTEGER NOT NULL DEFAULT 0,      -- |files(A) ∩ files(B)|
    union_files          INTEGER NOT NULL DEFAULT 0,      -- |files(A) ∪ files(B)| (para Jaccard)
    jaccard              REAL NOT NULL DEFAULT 0,         -- shared/union (0–1)
    hunk_overlap         INTEGER NOT NULL DEFAULT 0,      -- nº de archivos con rangos solapados
    zone_weight          REAL NOT NULL DEFAULT 0,         -- max(conflict_heat.score) de zonas compartidas (0–1)
    probability          REAL NOT NULL DEFAULT 0,         -- score compuesto normalizado (0–1)
    risk_score           INTEGER NOT NULL DEFAULT 0,      -- probability*100 (para UI/ordenar)
    level                TEXT NOT NULL DEFAULT 'low',     -- low | medium | high | critical
    confirmed            INTEGER NOT NULL DEFAULT 0,      -- 1 = merge-tree confirmó conflicto real (v3.2)
    shared_files_json    TEXT,                            -- JSON: lista de paths compartidos (para la UI)
    predicted_at         TEXT NOT NULL,                   -- ISO-8601 UTC del ciclo
    became_conflicting_at TEXT,                           -- ISO-8601 UTC: cuándo GitHub lo marcó (validación)
    lead_time_seconds    INTEGER,                         -- became_conflicting_at - predicted_at (validación)
    UNIQUE(kind, pr_a, pr_b)
);
CREATE INDEX IF NOT EXISTS idx_pred_level ON conflict_prediction(level, risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_pred_pr_a ON conflict_prediction(pr_a);
CREATE INDEX IF NOT EXISTS idx_pred_pr_b ON conflict_prediction(pr_b);
CREATE INDEX IF NOT EXISTS idx_pred_kind ON conflict_prediction(kind, risk_score DESC);

-- ----------------------------------------------------------------------------
-- prediction_backtest (v3.4) — resultados de validación (precision/recall/lead-time).
-- Una fila por corrida del arnés de backtest. No es read model de runtime; es
-- registro de calibración (auditable, comparable entre ajustes de pesos).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prediction_backtest (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at            TEXT NOT NULL,           -- ISO-8601 UTC
    mode              TEXT NOT NULL,           -- 'synthetic' | 'historical'
    weights_json      TEXT NOT NULL,           -- JSON: pesos usados (w_jaccard, w_hunk, w_zone, ...)
    true_positives    INTEGER NOT NULL DEFAULT 0,
    false_positives   INTEGER NOT NULL DEFAULT 0,
    false_negatives   INTEGER NOT NULL DEFAULT 0,
    precision_pct     REAL,                    -- TP / (TP+FP)
    recall_pct        REAL,                    -- TP / (TP+FN)
    f1                REAL,
    lead_time_p50_s   INTEGER,                 -- mediana de lead-time de los TP
    lead_time_p90_s   INTEGER,
    notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_backtest_ran ON prediction_backtest(ran_at DESC);

-- ============================================================================
-- Notas de integración
-- ----------------------------------------------------------------------------
-- 1. Estas tablas se añaden a ingest/schema.sql y a src/lib/db.ts (init idempotente),
--    igual que se hizo con conflict_file/heat/age_risk en V2.i.
-- 2. zone_weight se calcula uniendo los paths compartidos contra conflict_heat
--    (V2.i) por zona normalizada (normalizeZone, 2 niveles). Reusa, no recalcula.
-- 3. Orden canónico pr_a < pr_b evita pares duplicados (A,B)=(B,A) y simplifica el
--    UNIQUE. Para kind='pr_base', pr_b IS NULL.
-- 4. NINGUNA de estas tablas participa en el replay de V2.h (ADR-V3-3): son
--    materializadas por projector puro. El parity checker NO las compara; en su
--    lugar, su determinismo se prueba con golden-input tests (ver TESTING §determinismo).
-- ============================================================================
