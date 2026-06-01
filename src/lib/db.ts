import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Conexiones SQLite a la DB que rellena ingest/historian.py.
// - getDb(): readonly (lecturas, projectors que solo consultan)
// - getDbWritable(): read-write (decision_log, replay, shadow tables)
// Singleton cacheado en globalThis para sobrevivir al hot-reload de Next en dev.

type DbCache = { db: Database.Database | null; resolvedPath: string | null };

const globalForDb = globalThis as unknown as {
  __zoodashDb?: DbCache;
  __zoodashDbWritable?: DbCache;
};

function resolveDbPath(): string {
  const p = process.env.DATABASE_PATH || "./data/control-plane.db";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

/**
 * Devuelve la conexión SQLite (readonly) o `null` si la DB aún no existe
 * (p.ej. nunca se corrió el historian). El backend debe degradar con elegancia.
 */
export function getDb(): Database.Database | null {
  const dbPath = resolveDbPath();
  const cache = globalForDb.__zoodashDb;
  if (cache && cache.resolvedPath === dbPath) return cache.db;

  let db: Database.Database | null = null;
  if (fs.existsSync(dbPath)) {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  globalForDb.__zoodashDb = { db, resolvedPath: dbPath };
  return db;
}

/**
 * Devuelve la conexión SQLite writable (read-write) o `null` si la DB no existe.
 * Usar para: decision_log, replay shadow tables, parity checker.
 * NO usar para lecturas de solo lectura — usar getDb() para eso.
 */
export function getDbWritable(): Database.Database | null {
  const dbPath = resolveDbPath();
  const cache = globalForDb.__zoodashDbWritable;
  if (cache && cache.resolvedPath === dbPath) return cache.db;

  let db: Database.Database | null = null;
  if (fs.existsSync(dbPath)) {
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  globalForDb.__zoodashDbWritable = { db, resolvedPath: dbPath };
  return db;
}

/**
 * Asegura que la tabla decision_log existe (V2.h).
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 */
export function ensureDecisionLogTable(): void {
  const db = getDbWritable();
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS decision_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id         TEXT NOT NULL,
      evaluated_at    TEXT NOT NULL,
      entity_kind     TEXT,
      entity_ref      TEXT,
      state_snapshot   TEXT NOT NULL,
      pressure_snapshot TEXT,
      threshold       TEXT NOT NULL,
      triggered       INTEGER NOT NULL DEFAULT 0,
      alert_id        INTEGER,
      dedupe_key      TEXT,
      message         TEXT,
      UNIQUE(rule_id, entity_ref, evaluated_at)
    );
    CREATE INDEX IF NOT EXISTS idx_decision_rule ON decision_log(rule_id, evaluated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_decision_entity ON decision_log(entity_kind, entity_ref);
    CREATE INDEX IF NOT EXISTS idx_decision_triggered ON decision_log(triggered, evaluated_at DESC);
  `);
}

/**
 * Asegura que las tablas V2.i existen (conflict_file, conflict_heat, conflict_age_risk).
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 */
export function ensureConflictTables(): void {
  const db = getDbWritable();
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS conflict_file (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pr_number       INTEGER NOT NULL,
      file_path       TEXT NOT NULL,
      conflict_id     TEXT NOT NULL,
      detected_at     TEXT NOT NULL,
      resolved_at     TEXT,
      UNIQUE(pr_number, file_path, conflict_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cf_pr ON conflict_file(pr_number);
    CREATE INDEX IF NOT EXISTS idx_cf_path ON conflict_file(file_path, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cf_resolved ON conflict_file(resolved_at);

    CREATE TABLE IF NOT EXISTS conflict_heat (
      zone            TEXT PRIMARY KEY,
      file_count      INTEGER NOT NULL DEFAULT 0,
      conflict_count  INTEGER NOT NULL DEFAULT 0,
      last_conflict   TEXT,
      score           REAL NOT NULL DEFAULT 0,
      refreshed_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conflict_age_risk (
      pr_number       INTEGER PRIMARY KEY,
      age_days        REAL NOT NULL DEFAULT 0,
      file_count      INTEGER NOT NULL DEFAULT 0,
      zone_score      REAL NOT NULL DEFAULT 0,
      risk_score      REAL NOT NULL DEFAULT 0,
      risk_level      TEXT NOT NULL DEFAULT 'low',
      refreshed_at    TEXT NOT NULL
    );
  `);
}
