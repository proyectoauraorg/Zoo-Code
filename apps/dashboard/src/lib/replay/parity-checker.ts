// Parity Checker (V2.h) — verificación structural + semantic parity.
// Contract: V2H_SPEC.md §3, REPLAY_DETERMINISM_CONTRACT.md §6.
// Solo depende de better-sqlite3 (sin dependencia en engine → evita ciclo).

import type Database from "better-sqlite3";

export interface ParityDiff {
  table: string;
  column: string;
  entityId: string;
  liveValue: unknown;
  replayValue: unknown;
  level: "structural" | "semantic";
}

export interface ParityResult {
  match: boolean;
  structural: { checked: number; differences: ParityDiff[] };
  semantic: { checked: number; differences: ParityDiff[] };
  timestamp: string;
}

// ── Columnas a comparar por tabla (structural) ──

const LIFECYCLE_COLUMNS = ["state", "duration_seconds", "detected_at", "resolved_at", "title"];
const TRAJECTORY_COLUMNS = [
  "conflict_count",
  "resolution_count",
  "active_streak",
  "cooldown_breaches",
  "pressure_score",
  "first_seen_at",
  "last_seen_at",
];

/**
 * Compara tablas live vs _replay.
 * Dos niveles: structural (lifecycle + trajectory) y semantic (decision_log).
 */
export function checkParity(db: Database.Database): ParityResult {
  const structuralDiffs: ParityDiff[] = [];
  const semanticDiffs: ParityDiff[] = [];
  let structuralChecked = 0;
  let semanticChecked = 0;

  // ── Nivel 1: Structural ──

  // conflict_lifecycle: comparar por pr_number + aggregate_version
  structuralChecked += compareTable(
    db,
    "conflict_lifecycle",
    "conflict_lifecycle_replay",
    ["pr_number", "aggregate_version"],
    LIFECYCLE_COLUMNS,
    structuralDiffs,
    "structural",
  );

  // conflict_trajectory: comparar por pr_number
  structuralChecked += compareTable(
    db,
    "conflict_trajectory",
    "conflict_trajectory_replay",
    ["pr_number"],
    TRAJECTORY_COLUMNS,
    structuralDiffs,
    "structural",
  );

  // ── Nivel 2: Semantic (decision parity) ──

  const liveDecisions = safeAll(db, "decision_log");
  const replayDecisions = safeAll(db, "decision_log_replay");
  const decisionMap = new Map(
    replayDecisions.map((d) => [
      `${d.rule_id}:${d.entity_ref}:${d.evaluated_at}`,
      d,
    ]),
  );

  for (const row of liveDecisions) {
    const key = `${row.rule_id}:${row.entity_ref}:${row.evaluated_at}`;
    const shadow = decisionMap.get(key);
    semanticChecked++;

    if (!shadow) {
      semanticDiffs.push({
        table: "decision_log",
        column: "*",
        entityId: key,
        liveValue: row,
        replayValue: null,
        level: "semantic",
      });
      continue;
    }

    if (row.triggered !== shadow.triggered) {
      semanticDiffs.push({
        table: "decision_log",
        column: "triggered",
        entityId: key,
        liveValue: row.triggered,
        replayValue: shadow.triggered,
        level: "semantic",
      });
    }
    if (row.message !== shadow.message) {
      semanticDiffs.push({
        table: "decision_log",
        column: "message",
        entityId: key,
        liveValue: row.message,
        replayValue: shadow.message,
        level: "semantic",
      });
    }

    // Comparar pressure_snapshot (si existe en ambos)
    if (row.pressure_snapshot && shadow.pressure_snapshot) {
      try {
        const livePressure = JSON.parse(row.pressure_snapshot as string) as { pressure: number };
        const replayPressure = JSON.parse(shadow.pressure_snapshot as string) as { pressure: number };
        if (Math.abs(livePressure.pressure - replayPressure.pressure) > 0.001) {
          semanticDiffs.push({
            table: "decision_log",
            column: "pressure",
            entityId: key,
            liveValue: livePressure.pressure,
            replayValue: replayPressure.pressure,
            level: "semantic",
          });
        }
      } catch {
        // JSON inválido → skip
      }
    }
  }

  const allDiffs = [...structuralDiffs, ...semanticDiffs];
  return {
    match: allDiffs.length === 0,
    structural: { checked: structuralChecked, differences: structuralDiffs },
    semantic: { checked: semanticChecked, differences: semanticDiffs },
    timestamp: new Date().toISOString(),
  };
}

// ── Helpers internos ──

/** Lee todas las filas de una tabla. Devuelve [] si la tabla no existe. */
function safeAll(
  db: Database.Database,
  table: string,
): Array<Record<string, unknown>> {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

/**
 * Compara filas de una tabla live vs su tabla _replay.
 * Devuelve el número de filas comparadas.
 */
function compareTable(
  db: Database.Database,
  liveTable: string,
  replayTable: string,
  keyColumns: string[],
  valueColumns: string[],
  diffs: ParityDiff[],
  level: "structural" | "semantic",
): number {
  const live = safeAll(db, liveTable);
  const replay = safeAll(db, replayTable);

  const replayMap = new Map<string, Record<string, unknown>>();
  for (const r of replay) {
    replayMap.set(keyColumns.map((k) => String(r[k])).join(":"), r);
  }

  let checked = 0;
  for (const row of live) {
    const key = keyColumns.map((k) => String(row[k])).join(":");
    const shadow = replayMap.get(key);
    checked++;

    if (!shadow) {
      diffs.push({
        table: liveTable,
        column: "*",
        entityId: key,
        liveValue: row,
        replayValue: null,
        level,
      });
      continue;
    }

    for (const col of valueColumns) {
      // Comparación numérica tolerante para pressure_score
      if (col === "pressure_score") {
        const liveVal = Number(row[col]);
        const replayVal = Number(shadow[col]);
        if (Math.abs(liveVal - replayVal) > 0.001) {
          diffs.push({
            table: liveTable,
            column: col,
            entityId: key,
            liveValue: row[col],
            replayValue: shadow[col],
            level,
          });
        }
      } else if (row[col] !== shadow[col]) {
        diffs.push({
          table: liveTable,
          column: col,
          entityId: key,
          liveValue: row[col],
          replayValue: shadow[col],
          level,
        });
      }
    }
  }

  return checked;
}
