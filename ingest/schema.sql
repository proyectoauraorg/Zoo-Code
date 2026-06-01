-- ============================================================================
-- Zoo Code Control Plane — Modelo de datos v1 (SQLite)
-- ----------------------------------------------------------------------------
-- Filosofía: el runtime ya recolecta; aquí solo HISTORIZAMOS (append por poll).
-- "Estado actual" = filas con MAX(ts). "Tendencias" = GROUP BY date(ts).
-- Compatible con SQLite (better-sqlite3). Notas de migración a Postgres/Timescale
-- al final (v2).
-- Timestamps en ISO-8601 UTC (texto), igual que los snapshots del runtime.
-- ============================================================================

-- Cada ejecución del historian = un "poll" con su ts. Permite agrupar las filas
-- de un mismo barrido y hacer la historización idempotente (UNIQUE por ts).
CREATE TABLE IF NOT EXISTS poll (
    ts            TEXT PRIMARY KEY,           -- = github.json.fetched_at del barrido
    ingested_at   TEXT NOT NULL,              -- cuándo lo procesó el historian
    source_ok     INTEGER NOT NULL DEFAULT 1, -- snapshot.ok
    note          TEXT
);

-- Métricas agregadas del repo por poll → series del Overview.
CREATE TABLE IF NOT EXISTS repo_metric (
    ts             TEXT PRIMARY KEY REFERENCES poll(ts) ON DELETE CASCADE,
    pr_open        INTEGER NOT NULL DEFAULT 0,
    pr_merged      INTEGER NOT NULL DEFAULT 0,
    pr_closed      INTEGER NOT NULL DEFAULT 0,
    pr_ci_failing  INTEGER NOT NULL DEFAULT 0,
    issues         INTEGER NOT NULL DEFAULT 0,
    mentions       INTEGER NOT NULL DEFAULT 0,
    subscriptions  INTEGER NOT NULL DEFAULT 0,
    notifs_total   INTEGER NOT NULL DEFAULT 0,
    drift_ahead    INTEGER NOT NULL DEFAULT 0,
    drift_behind   INTEGER NOT NULL DEFAULT 0,
    release        TEXT                         -- p.ej. "v3.55.1" (parseado del summary)
);

-- Estado de cada PR en cada poll → PR Board + aging.
CREATE TABLE IF NOT EXISTS pr_snapshot (
    ts              TEXT NOT NULL REFERENCES poll(ts) ON DELETE CASCADE,
    number          INTEGER NOT NULL,
    title           TEXT,
    url             TEXT,
    state           TEXT,        -- OPEN | MERGED | CLOSED
    review_decision TEXT,        -- '' | REVIEW_REQUIRED | CHANGES_REQUESTED | APPROVED
    mergeable       TEXT,        -- MERGEABLE | CONFLICTING | UNKNOWN
    is_draft        INTEGER NOT NULL DEFAULT 0,
    ci_state        TEXT,        -- pass | fail | pending | none
    ci_passed       INTEGER NOT NULL DEFAULT 0,
    ci_failed       INTEGER NOT NULL DEFAULT 0,
    ci_pending      INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT,        -- = item.ts (updatedAt del PR)
    created_at      TEXT,        -- ISO-8601 UTC: cuándo se abrió el PR
    merged_at       TEXT,        -- ISO-8601 UTC: cuándo se mergeó (NULL si no)
    PRIMARY KEY (ts, number)
);
CREATE INDEX IF NOT EXISTS idx_pr_snapshot_number ON pr_snapshot(number, ts);

-- Estado de cada issue por poll.
CREATE TABLE IF NOT EXISTS issue_snapshot (
    ts          TEXT NOT NULL REFERENCES poll(ts) ON DELETE CASCADE,
    number      INTEGER NOT NULL,
    title       TEXT,
    url         TEXT,
    state       TEXT,            -- OPEN | CLOSED
    labels      TEXT,            -- JSON array como texto (SQLite no tiene arrays)
    assignee    TEXT,
    milestone   TEXT,
    updated_at  TEXT,
    PRIMARY KEY (ts, number)
);
CREATE INDEX IF NOT EXISTS idx_issue_snapshot_number ON issue_snapshot(number, ts);

-- Transiciones derivadas (diff entre dos polls consecutivos) → feed + cycle-time.
-- kind: state_change | ci_red | ci_green | conflict | resolved | new | merged | closed
CREATE TABLE IF NOT EXISTS pr_event (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,        -- ts del poll donde se detectó
    number      INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    from_state  TEXT,
    to_state    TEXT,
    detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_pr_event_number ON pr_event(number, ts);
CREATE INDEX IF NOT EXISTS idx_pr_event_ts ON pr_event(ts);

-- Contribuidores detectados (por snapshot actor o backfill de GitHub API).
CREATE TABLE IF NOT EXISTS contributor (
    login       TEXT PRIMARY KEY,               -- github login
    first_seen  TEXT NOT NULL,                  -- ISO-8601 UTC
    last_seen   TEXT NOT NULL,                  -- ISO-8601 UTC
    prs_opened  INTEGER NOT NULL DEFAULT 0,     -- total histórico
    prs_merged  INTEGER NOT NULL DEFAULT 0,
    prs_closed  INTEGER NOT NULL DEFAULT 0
);

-- Puente PR↔contributor (quién abrió cada PR).
CREATE TABLE IF NOT EXISTS pr_author (
    ts          TEXT NOT NULL,                  -- poll ts
    pr_number   INTEGER NOT NULL,
    login       TEXT NOT NULL,
    PRIMARY KEY (ts, pr_number),
    FOREIGN KEY (ts, pr_number) REFERENCES pr_snapshot(ts, number) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pr_author_login ON pr_author(login, ts);

-- (Opcional v1.5) actividad Discord, leída de snapshots/discord.json
CREATE TABLE IF NOT EXISTS discord_activity (
    ts          TEXT NOT NULL,
    user        TEXT,
    channel     TEXT,
    msg_type    TEXT,
    detail      TEXT,
    PRIMARY KEY (ts, user, channel, msg_type, detail)
);

-- ============================================================================
-- Consultas de referencia
-- ============================================================================

-- Estado actual de PRs (último poll):
--   SELECT * FROM pr_snapshot WHERE ts = (SELECT MAX(ts) FROM poll);

-- Serie de PRs abiertos por día:
--   SELECT date(ts) d, MAX(pr_open) FROM repo_metric GROUP BY d ORDER BY d;

-- Aging: primera aparición de un PR en su estado actual.
--   Para cada number, el ts más antiguo de la racha contigua con el mismo (state,review_decision).
--   En v1 basta aproximar con: MIN(ts) donde (state,review_decision) == el actual.

-- PRs merged esta semana:
--   SELECT COUNT(DISTINCT number) FROM pr_event
--   WHERE kind='merged' AND ts >= datetime('now','-7 days');

-- Event log — append-only, auditable, idempotente (EM v1).
CREATE TABLE IF NOT EXISTS event_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    ts              TEXT NOT NULL,
    ingested_at     TEXT NOT NULL,
    source          TEXT NOT NULL,           -- historian | backfill | manual
    type            TEXT NOT NULL,           -- pr.new | pr.merged | ...
    entity_kind     TEXT NOT NULL,           -- pr | issue | system
    entity_ref      TEXT NOT NULL,           -- "388" | "poll" | "health"
    payload         TEXT NOT NULL,           -- JSON
    aggregate_version INTEGER NOT NULL DEFAULT 0,
    correlation_id  TEXT,                    -- V2.h: agrupa eventos del mismo poll/batch
    causation_id    TEXT                     -- V2.h: qué evento causó este (NULL = root)
);
CREATE INDEX IF NOT EXISTS idx_event_entity ON event_log(entity_kind, entity_ref, ts DESC);
CREATE INDEX IF NOT EXISTS idx_event_type_ts ON event_log(type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_event_ts ON event_log(ts);
CREATE INDEX IF NOT EXISTS idx_event_aggregate ON event_log(entity_kind, entity_ref, aggregate_version);
CREATE INDEX IF NOT EXISTS idx_event_correlation ON event_log(correlation_id);

-- Projection checkpointing (Int.4).
CREATE TABLE IF NOT EXISTS projection_checkpoint (
    projection_name TEXT PRIMARY KEY,
    last_event_id   INTEGER NOT NULL,
    last_ts         TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Conflict lifecycle (V2.f) — temporal conflict state machine.
CREATE TABLE IF NOT EXISTS conflict_lifecycle (
    id                  TEXT PRIMARY KEY,
    pr_number           INTEGER NOT NULL,
    state               TEXT NOT NULL,           -- "entered" | "resolved"
    event_id            TEXT NOT NULL,
    aggregate_version   INTEGER NOT NULL,
    detected_at         TEXT NOT NULL,
    resolved_at         TEXT,
    duration_seconds    INTEGER,
    title               TEXT,
    UNIQUE(pr_number, aggregate_version)
);
CREATE INDEX IF NOT EXISTS idx_conflict_pr ON conflict_lifecycle(pr_number);
CREATE INDEX IF NOT EXISTS idx_conflict_state ON conflict_lifecycle(state, detected_at DESC);

-- Conflict trajectory (v1.2.1) — modelo de presión temporal por PR.
CREATE TABLE IF NOT EXISTS conflict_trajectory (
    pr_number           INTEGER PRIMARY KEY,
    conflict_count      INTEGER NOT NULL DEFAULT 0,
    resolution_count    INTEGER NOT NULL DEFAULT 0,
    active_streak       INTEGER NOT NULL DEFAULT 0,
    cooldown_breaches   INTEGER NOT NULL DEFAULT 0,
    pressure_score      REAL NOT NULL DEFAULT 0,
    first_seen_at       TEXT NOT NULL,
    last_seen_at        TEXT NOT NULL,
    aggregate_version   INTEGER NOT NULL DEFAULT 0
);

-- Alerting engine (V2.g) — reglas + alertas con dedupe/cooldown.
CREATE TABLE IF NOT EXISTS alert_rule (
    id          TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 1,
    threshold   TEXT NOT NULL DEFAULT '{}',
    cooldown_s  INTEGER NOT NULL DEFAULT 86400
);

CREATE TABLE IF NOT EXISTS alert (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id      TEXT NOT NULL REFERENCES alert_rule(id),
    dedupe_key   TEXT NOT NULL,
    severity     TEXT NOT NULL DEFAULT 'warning',
    message      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',
    opened_at    TEXT NOT NULL DEFAULT (datetime('now')),
    notified_at  TEXT,
    resolved_at  TEXT,
    UNIQUE(rule_id, dedupe_key, status)
);
CREATE INDEX IF NOT EXISTS idx_alert_open ON alert(status, opened_at DESC) WHERE status = 'open';

-- Decision log (V2.h) — trazabilidad de decisiones del alerting engine.
-- Cada fila = una evaluación de una regla contra el estado, con resultado.
CREATE TABLE IF NOT EXISTS decision_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id         TEXT NOT NULL,
    evaluated_at    TEXT NOT NULL,               -- ISO-8601 UTC
    entity_kind     TEXT,                        -- pr | issue | system | null
    entity_ref      TEXT,                        -- "388" | null
    state_snapshot   TEXT NOT NULL,               -- JSON: datos relevantes del estado
    pressure_snapshot TEXT,                       -- JSON: pressure_score + componentes (si aplica)
    threshold       TEXT NOT NULL,               -- JSON: regla evaluada
    triggered       INTEGER NOT NULL DEFAULT 0,  -- 1 = alerta generada, 0 = no
    alert_id        INTEGER,                     -- FK a alert.id si triggered=1
    dedupe_key      TEXT,                        -- clave de dedup si se generó
    message         TEXT,                        -- mensaje de la alerta (si triggered)
    UNIQUE(rule_id, entity_ref, evaluated_at)    -- idempotencia por evaluación
);
CREATE INDEX IF NOT EXISTS idx_decision_rule ON decision_log(rule_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_entity ON decision_log(entity_kind, entity_ref);
CREATE INDEX IF NOT EXISTS idx_decision_triggered ON decision_log(triggered, evaluated_at DESC);

-- Métricas internas de ZooDash (latencias, contadores, recursos).
CREATE TABLE IF NOT EXISTS internal_metric (
    ts      TEXT NOT NULL DEFAULT (datetime('now')),
    key     TEXT NOT NULL,
    value   REAL NOT NULL,
    PRIMARY KEY (ts, key)
);
CREATE INDEX IF NOT EXISTS idx_internal_metric_key ON internal_metric(key, ts DESC);

-- Read models materializados (V2.d.2) — owner: historian.py.
-- Tablas derivadas que precalculan agregaciones costosas para lectura rápida.

CREATE TABLE IF NOT EXISTS contributor_summary (
    login               TEXT PRIMARY KEY,
    prs_opened          INTEGER NOT NULL DEFAULT 0,
    prs_merged          INTEGER NOT NULL DEFAULT 0,
    prs_closed          INTEGER NOT NULL DEFAULT 0,
    cycle_p50_h         REAL,
    cycle_p90_h         REAL,
    commit_share_pct    REAL,
    last_active         TEXT,
    refreshed_at        TEXT NOT NULL DEFAULT (datetime('now')),
    schema_version      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS conflict_hotspot (
    path            TEXT PRIMARY KEY,
    times           INTEGER NOT NULL DEFAULT 0,
    last_seen       TEXT,
    schema_version  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS system_snapshot (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,          -- JSON como texto (SQLite no tiene JSONB)
    refreshed_at    TEXT NOT NULL DEFAULT (datetime('now')),
    schema_version  INTEGER NOT NULL DEFAULT 1
);

-- Conflict file (V2.i) — archivos reales en conflicto por PR.
-- Origen: enricher Python ejecuta git merge-tree sobre clon read-only.
CREATE TABLE IF NOT EXISTS conflict_file (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pr_number       INTEGER NOT NULL,
    file_path       TEXT NOT NULL,              -- ruta relativa (p.ej. src/lib/db.ts)
    conflict_id     TEXT NOT NULL,              -- FK lógico a conflict_lifecycle.id
    detected_at     TEXT NOT NULL,              -- ISO-8601 UTC
    resolved_at     TEXT,                       -- ISO-8601 UTC (NULL si abierto)
    UNIQUE(pr_number, file_path, conflict_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_pr ON conflict_file(pr_number);
CREATE INDEX IF NOT EXISTS idx_cf_path ON conflict_file(file_path, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cf_resolved ON conflict_file(resolved_at);

-- Conflict heat (V2.i) — agregación por zona del repo para Heat Graph.
CREATE TABLE IF NOT EXISTS conflict_heat (
    zone            TEXT PRIMARY KEY,           -- prefijo normalizado (p.ej. "src/lib")
    file_count      INTEGER NOT NULL DEFAULT 0,
    conflict_count  INTEGER NOT NULL DEFAULT 0,
    last_conflict   TEXT,                       -- ISO-8601 UTC
    score           REAL NOT NULL DEFAULT 0,    -- peso normalizado (0–1)
    refreshed_at    TEXT NOT NULL
);

-- Conflict age risk (V2.i) — scoring por PR para priorización.
CREATE TABLE IF NOT EXISTS conflict_age_risk (
    pr_number       INTEGER PRIMARY KEY,
    age_days        REAL NOT NULL DEFAULT 0,
    file_count      INTEGER NOT NULL DEFAULT 0,
    zone_score      REAL NOT NULL DEFAULT 0,
    risk_score      REAL NOT NULL DEFAULT 0,    -- score compuesto (0–100)
    risk_level      TEXT NOT NULL DEFAULT 'low', -- low|medium|high|critical
    refreshed_at    TEXT NOT NULL
);

-- ============================================================================
-- NOTAS DE MIGRACIÓN A v2 (PostgreSQL + TimescaleDB)
-- ============================================================================
-- 1. repo_metric → hypertable:  SELECT create_hypertable('repo_metric','ts');
--    (ts pasa a TIMESTAMPTZ; quitar PRIMARY KEY simple, usar (ts) como dimensión).
-- 2. labels TEXT(JSON) → JSONB; assignee/reviewers → tabla puente.
-- 3. Añadir: contributor(github_login, discord_id, role), pr_reviewer(pr, reviewer, state),
--    code_review(pr, reviewer, state, comments_count, submitted_at), commit(sha, pr, author).
-- 4. Ingesta push: webhooks GitHub → NATS → proyección a estas tablas (tiempo real <30s).
-- 5. Retención/compresión: políticas TimescaleDB sobre repo_metric.
