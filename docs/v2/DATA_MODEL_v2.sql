-- ============================================================================
-- ZooDash v2 — Modelo de datos (PostgreSQL 16 + TimescaleDB)
-- ----------------------------------------------------------------------------
-- Plano, NO ejecutado. Filosofía: event store auditable (event_log) + PROYECCIONES
-- (estado actual) + HYPERTABLES Timescale (series). Reconstruible re-proyectando el log.
-- Timestamps en TIMESTAMPTZ (UTC). Migra del esquema v1 (SQLite) — ver §Migración.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ----------------------------------------------------------------------------
-- 1) EVENT STORE (append-only, auditable, idempotente)
-- ----------------------------------------------------------------------------
CREATE TABLE event_log (
    id             BIGSERIAL PRIMARY KEY,
    event_id       TEXT NOT NULL UNIQUE,        -- determinista → dedupe webhook/reconciler
    schema_version INTEGER NOT NULL DEFAULT 1,  -- ADR-10: upcasting en el projector
    ts             TIMESTAMPTZ NOT NULL,        -- cuándo ocurrió (de GitHub)
    ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    source       TEXT NOT NULL,                 -- webhook | graphql | reconciler
    type         TEXT NOT NULL,                 -- pr | review | ci | push | issue | comment | discord
    action       TEXT,                          -- opened | merged | review_submitted | ...
    repo         TEXT NOT NULL,
    entity_kind  TEXT NOT NULL,                 -- pr | issue | contributor | ...
    entity_ref   TEXT NOT NULL,                 -- p.ej. número de PR como texto
    payload      JSONB NOT NULL,                -- payload normalizado
    raw_digest   TEXT                           -- sha256 del original (auditar)
);
CREATE INDEX idx_event_entity ON event_log (entity_kind, entity_ref, ts DESC);
CREATE INDEX idx_event_type_ts ON event_log (type, ts DESC);
CREATE INDEX idx_event_payload_gin ON event_log USING gin (payload);

-- ----------------------------------------------------------------------------
-- 2) PROYECCIONES — estado actual
-- ----------------------------------------------------------------------------
CREATE TABLE contributor (
    login        TEXT PRIMARY KEY,              -- github_login
    discord_id   TEXT,                          -- enlace a Discord (si se conoce)
    role         TEXT,                          -- maintainer | contributor | bot | ...
    avatar_url   TEXT,
    first_seen   TIMESTAMPTZ,
    last_seen    TIMESTAMPTZ
);

CREATE TABLE pr (
    number          INTEGER PRIMARY KEY,
    title           TEXT,
    url             TEXT,
    author_login    TEXT REFERENCES contributor(login),
    state           TEXT,                        -- OPEN | MERGED | CLOSED
    review_decision TEXT,                        -- '' | REVIEW_REQUIRED | CHANGES_REQUESTED | APPROVED
    mergeable       TEXT,                        -- MERGEABLE | CONFLICTING | UNKNOWN
    is_draft        BOOLEAN NOT NULL DEFAULT false,
    ci_state        TEXT,                        -- pass | fail | pending | none
    ci_passed       INTEGER NOT NULL DEFAULT 0,
    ci_failed       INTEGER NOT NULL DEFAULT 0,
    ci_pending      INTEGER NOT NULL DEFAULT 0,
    base_ref        TEXT,
    head_ref        TEXT,
    additions       INTEGER,
    deletions       INTEGER,
    changed_files   INTEGER,
    labels          JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    merged_at       TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ
);
CREATE INDEX idx_pr_author ON pr (author_login);
CREATE INDEX idx_pr_state ON pr (state);

CREATE TABLE issue (
    number      INTEGER PRIMARY KEY,
    title       TEXT,
    url         TEXT,
    author_login TEXT REFERENCES contributor(login),
    state       TEXT,                            -- OPEN | CLOSED
    labels      JSONB NOT NULL DEFAULT '[]',
    assignee    TEXT,
    milestone   TEXT,
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ,
    closed_at   TIMESTAMPTZ
);

-- Reviewers solicitados / asignados a un PR (puente).
CREATE TABLE pr_reviewer (
    pr_number     INTEGER NOT NULL REFERENCES pr(number) ON DELETE CASCADE,
    reviewer_login TEXT NOT NULL REFERENCES contributor(login),
    requested_at  TIMESTAMPTZ,
    PRIMARY KEY (pr_number, reviewer_login)
);

-- Cada review enviada (para latencia y carga de revisión).
CREATE TABLE code_review (
    id             TEXT PRIMARY KEY,             -- id de la review (GraphQL)
    pr_number      INTEGER NOT NULL REFERENCES pr(number) ON DELETE CASCADE,
    reviewer_login TEXT NOT NULL REFERENCES contributor(login),
    state          TEXT,                         -- APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED
    comments_count INTEGER NOT NULL DEFAULT 0,
    submitted_at   TIMESTAMPTZ
);
CREATE INDEX idx_review_pr ON code_review (pr_number);
CREATE INDEX idx_review_reviewer ON code_review (reviewer_login, submitted_at DESC);

-- Commits por PR.
CREATE TABLE commit (
    sha          TEXT PRIMARY KEY,
    pr_number    INTEGER REFERENCES pr(number) ON DELETE CASCADE,
    author_login TEXT REFERENCES contributor(login),
    authored_at  TIMESTAMPTZ,
    additions    INTEGER,
    deletions    INTEGER
);
CREATE INDEX idx_commit_pr ON commit (pr_number);

-- Conflictos de merge (ciclo de vida) + archivos en conflicto (hotspots).
CREATE TABLE conflict (
    id           BIGSERIAL PRIMARY KEY,
    pr_number    INTEGER NOT NULL REFERENCES pr(number) ON DELETE CASCADE,
    base_ref     TEXT,
    head_ref     TEXT,
    detected_at  TIMESTAMPTZ NOT NULL,
    resolved_at  TIMESTAMPTZ,                    -- NULL = sigue en conflicto
    status       TEXT NOT NULL DEFAULT 'open'    -- open | resolved
);
CREATE INDEX idx_conflict_pr ON conflict (pr_number);
CREATE INDEX idx_conflict_open ON conflict (status) WHERE status = 'open';

CREATE TABLE conflict_file (
    conflict_id  BIGINT NOT NULL REFERENCES conflict(id) ON DELETE CASCADE,
    path         TEXT NOT NULL,
    PRIMARY KEY (conflict_id, path)
);
CREATE INDEX idx_conflict_file_path ON conflict_file (path);

-- ----------------------------------------------------------------------------
-- 2b) READ MODELS MATERIALIZADOS (ADR-12) — los mantiene el projector → UI instantánea
-- ----------------------------------------------------------------------------
CREATE TABLE contributor_summary (
    login                 TEXT PRIMARY KEY REFERENCES contributor(login) ON DELETE CASCADE,
    prs_opened            INTEGER NOT NULL DEFAULT 0,
    prs_merged            INTEGER NOT NULL DEFAULT 0,
    reviews               INTEGER NOT NULL DEFAULT 0,
    commits               INTEGER NOT NULL DEFAULT 0,
    cycle_p50_h           DOUBLE PRECISION,           -- mediana cycle-time (horas)
    cycle_p90_h           DOUBLE PRECISION,
    review_latency_h      DOUBLE PRECISION,           -- 1ª review − apertura (media)
    waiting_hours_caused  DOUBLE PRECISION,           -- Review Bottleneck Score
    commit_share_pct      DOUBLE PRECISION,           -- Ownership Concentration
    last_active           TIMESTAMPTZ,
    refreshed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conflict_hotspot (
    path        TEXT PRIMARY KEY,
    times       INTEGER NOT NULL DEFAULT 0,           -- nº de conflictos históricos en el archivo
    last_seen   TIMESTAMPTZ
);

-- Mapa archivos↔personas (Knowledge Distribution; sub-fase opcional, requiere ingesta de files).
CREATE TABLE file_touch (
    path       TEXT NOT NULL,
    login      TEXT NOT NULL REFERENCES contributor(login),
    commits    INTEGER NOT NULL DEFAULT 0,
    last_at    TIMESTAMPTZ,
    PRIMARY KEY (path, login)
);
CREATE INDEX idx_file_touch_login ON file_touch (login);

-- ----------------------------------------------------------------------------
-- 2c) ALERTING (ADR-13) — reglas + alertas con dedupe/cooldown; notifica vía Apprise (v1)
-- ----------------------------------------------------------------------------
CREATE TABLE alert_rule (
    id          TEXT PRIMARY KEY,                     -- 'pr_aging' | 'ci_persistent' | 'review_wait' | ...
    enabled     BOOLEAN NOT NULL DEFAULT true,
    threshold   JSONB NOT NULL DEFAULT '{}',          -- {days:14} | {fails:3} | {hours:72} | ...
    cooldown_s  INTEGER NOT NULL DEFAULT 86400        -- no re-alertar antes de N s
);

CREATE TABLE alert (
    id           BIGSERIAL PRIMARY KEY,
    rule_id      TEXT NOT NULL REFERENCES alert_rule(id),
    dedupe_key   TEXT NOT NULL,                        -- 'pr_aging:388' → idempotencia anti-spam
    entity_kind  TEXT,
    entity_ref   TEXT,
    severity     TEXT NOT NULL DEFAULT 'warning',      -- info | warning | critical
    message      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',         -- open | resolved
    opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified_at  TIMESTAMPTZ,
    resolved_at  TIMESTAMPTZ,
    UNIQUE (rule_id, dedupe_key, status)               -- una alerta abierta por clave
);
CREATE INDEX idx_alert_open ON alert (status, opened_at DESC) WHERE status = 'open';

-- ----------------------------------------------------------------------------
-- 3) HYPERTABLES (series temporales)
-- ----------------------------------------------------------------------------
-- Métricas agregadas del repo por poll/evento (equivale a repo_metric v1).
CREATE TABLE repo_metric (
    ts             TIMESTAMPTZ NOT NULL,
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
    release        TEXT
);
SELECT create_hypertable('repo_metric', 'ts');

-- Historia de estado por PR (para aging exacto y reconstrucción de columnas Kanban).
CREATE TABLE pr_state_history (
    ts              TIMESTAMPTZ NOT NULL,
    number          INTEGER NOT NULL,
    state           TEXT,
    review_decision TEXT,
    mergeable       TEXT,
    is_draft        BOOLEAN,
    ci_state        TEXT
);
SELECT create_hypertable('pr_state_history', 'ts');
CREATE INDEX idx_prhist_number ON pr_state_history (number, ts DESC);

-- Rollup diario por contribuidor (tendencias de actividad).
CREATE TABLE contributor_metric_daily (
    ts                 TIMESTAMPTZ NOT NULL,     -- date_trunc('day')
    login              TEXT NOT NULL,
    prs_opened         INTEGER NOT NULL DEFAULT 0,
    prs_merged         INTEGER NOT NULL DEFAULT 0,
    reviews_submitted  INTEGER NOT NULL DEFAULT 0,
    commits            INTEGER NOT NULL DEFAULT 0,
    additions          INTEGER NOT NULL DEFAULT 0,
    deletions          INTEGER NOT NULL DEFAULT 0
);
SELECT create_hypertable('contributor_metric_daily', 'ts');
CREATE INDEX idx_cmd_login ON contributor_metric_daily (login, ts DESC);

-- Actividad Discord (del runtime; .context_inbox/discord.txt → discord.json). Sin scraping.
CREATE TABLE discord_activity (
    ts        TIMESTAMPTZ NOT NULL,
    discord_user TEXT,
    channel   TEXT,
    msg_type  TEXT,                              -- message | thread | reaction | ...
    detail    TEXT
);
SELECT create_hypertable('discord_activity', 'ts');
CREATE INDEX idx_discord_channel ON discord_activity (channel, ts DESC);

-- Transiciones derivadas (feed + cycle-time); igual semántica que pr_event v1.
CREATE TABLE pr_event (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL,
    number      INTEGER NOT NULL,
    kind        TEXT NOT NULL,                   -- new|merged|closed|state_change|ci_red|ci_green|conflict|resolved
    from_state  TEXT,
    to_state    TEXT,
    detail      TEXT
);
CREATE INDEX idx_pr_event_number ON pr_event (number, ts DESC);

-- ----------------------------------------------------------------------------
-- 4) POLÍTICAS Timescale (compresión + retención)
-- ----------------------------------------------------------------------------
ALTER TABLE repo_metric SET (timescaledb.compress, timescaledb.compress_orderby = 'ts DESC');
SELECT add_compression_policy('repo_metric', INTERVAL '14 days');
SELECT add_retention_policy('repo_metric', INTERVAL '365 days');
SELECT add_retention_policy('pr_state_history', INTERVAL '180 days');
SELECT add_retention_policy('discord_activity', INTERVAL '180 days');

-- (Opcional) continuous aggregate: serie diaria de PRs abiertos.
-- CREATE MATERIALIZED VIEW repo_metric_daily WITH (timescaledb.continuous) AS
--   SELECT time_bucket('1 day', ts) AS day, max(pr_open) AS pr_open,
--          max(pr_ci_failing) AS pr_ci_failing, max(issues) AS issues
--   FROM repo_metric GROUP BY day;

-- ============================================================================
-- CONSULTAS DE REFERENCIA
-- ============================================================================
-- Cycle-time (abierto→mergeado), distribución por contribuidor (últimos 90 días):
--   SELECT author_login,
--          count(*) AS merged,
--          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (merged_at-created_at))/3600) AS p50_h,
--          percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (merged_at-created_at))/3600) AS p90_h
--   FROM pr WHERE merged_at >= now()-INTERVAL '90 days' GROUP BY author_login ORDER BY merged DESC;

-- Carga y latencia de revisión por reviewer (últimos 30 días):
--   SELECT reviewer_login, count(*) reviews,
--          avg(EXTRACT(EPOCH FROM (cr.submitted_at - p.created_at))/3600) AS avg_latency_h
--   FROM code_review cr JOIN pr p USING (number)  -- (number = cr.pr_number)
--   WHERE cr.submitted_at >= now()-INTERVAL '30 days' GROUP BY reviewer_login ORDER BY reviews DESC;

-- Conflictos abiertos y su duración:
--   SELECT pr_number, detected_at, now()-detected_at AS open_for
--   FROM conflict WHERE status='open' ORDER BY detected_at;

-- Hotspots de conflicto (archivos que más reaparecen):
--   SELECT path, count(*) AS times FROM conflict_file GROUP BY path ORDER BY times DESC LIMIT 20;

-- Serie de PRs abiertos por día (Timescale):
--   SELECT time_bucket('1 day', ts) AS day, max(pr_open) FROM repo_metric
--   WHERE ts >= now()-INTERVAL '30 days' GROUP BY day ORDER BY day;

-- Actividad Discord por canal (7 días):
--   SELECT channel, count(*) FROM discord_activity
--   WHERE ts >= now()-INTERVAL '7 days' GROUP BY channel ORDER BY 2 DESC;

-- ============================================================================
-- MIGRACIÓN v1 (SQLite) → v2 (Postgres)  [script de backfill idempotente]
-- ============================================================================
-- 1. repo_metric: copiar filas SQLite → repo_metric PG (ts TEXT → TIMESTAMPTZ).
-- 2. pr_snapshot (v1) → pr_state_history (PG) + última fila por número → proyección pr.
-- 3. issue_snapshot → issue. pr_event → pr_event (ts a TIMESTAMPTZ).
-- 4. contributor: sembrar desde GH_LOGINS + autores observados; enriquecer con GraphQL.
-- 5. Verificación de paridad: contar filas y comparar series clave (dual-read test).
-- NOTA: ejecutar con el projector en modo 'replay' leyendo el histórico como event_log.
