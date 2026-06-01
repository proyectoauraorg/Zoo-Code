// Projector: conflict-file — V2.i: conflict_file → hotspot (reales) + heat + ageRisk.
// Patrón: DELETE + INSERT idempotente (V2.h).
// CRÍTICO: acepta `db: Database.Database` como parámetro para replay compatibility.
// Spec §3–§5.

import type Database from "better-sqlite3";
import { normalizeZone, classifyRisk } from "@/lib/conflict/merge-tree-parser";

/**
 * Fallback V2.f: proyecta hotspots usando PR#N como path (comportamiento legacy).
 * Se usa cuando conflict_file está vacío (enricher no corrió o git no disponible).
 */
function refreshConflictHotspotLegacy(db: Database.Database): number {
  const latestPoll = db
    .prepare("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1")
    .get() as { ts: string } | undefined;
  if (!latestPoll) return 0;

  const conflicting = db
    .prepare(
      `SELECT number, title
       FROM pr_snapshot
       WHERE ts = ? AND mergeable = 'CONFLICTING'`,
    )
    .all(latestPoll.ts) as Array<{ number: number; title: string }>;

  if (conflicting.length === 0) return 0;

  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

  const upsert = db.prepare(
    `INSERT INTO conflict_hotspot (path, times, last_seen, schema_version)
     VALUES (?, 1, ?, 1)
     ON CONFLICT(path) DO UPDATE SET
       times = times + 1,
       last_seen = ?`,
  );

  const txn = db.transaction(() => {
    for (const pr of conflicting) {
      const path = `PR#${pr.number}`;
      upsert.run(path, now, now);
    }
  });
  txn();

  return conflicting.length;
}

/**
 * Refresca conflict_hotspot con paths reales desde conflict_file.
 * Fallback V2.f si conflict_file está vacío.
 * Spec §3.3–3.4.
 */
export function refreshConflictFileHotspots(db: Database.Database): number {
  db.prepare("DELETE FROM conflict_hotspot").run();

  // Verificar si hay datos en conflict_file
  const hasFiles = db
    .prepare("SELECT COUNT(*) AS c FROM conflict_file")
    .get() as { c: number };

  if (hasFiles.c === 0) {
    // Fallback: usar PR#N como path (comportamiento V2.f)
    return refreshConflictHotspotLegacy(db);
  }

  // Proyección real con paths desde conflict_file
  const rows = db
    .prepare(
      `SELECT file_path AS path,
              COUNT(*) AS times,
              MAX(detected_at) AS last_seen
       FROM conflict_file
       WHERE resolved_at IS NULL
       GROUP BY file_path
       ORDER BY times DESC`,
    )
    .all() as Array<{ path: string; times: number; last_seen: string }>;

  const upsert = db.prepare(
    `INSERT INTO conflict_hotspot (path, times, last_seen, schema_version)
     VALUES (?, ?, ?, 2)
     ON CONFLICT(path) DO UPDATE SET
       times = excluded.times,
       last_seen = excluded.last_seen,
       schema_version = 2`,
  );

  const txn = db.transaction(() => {
    for (const r of rows) {
      upsert.run(r.path, r.times, r.last_seen);
    }
  });
  txn();

  return rows.length;
}

/**
 * Refresca conflict_heat (agregaciones por zona).
 * Spec §4.
 */
export function refreshConflictHeat(db: Database.Database): number {
  db.prepare("DELETE FROM conflict_heat").run();

  // Usar normalización de zona en JS para consistencia con tests
  const files = db
    .prepare(
      `SELECT file_path, detected_at
       FROM conflict_file
       WHERE resolved_at IS NULL`,
    )
    .all() as Array<{ file_path: string; detected_at: string }>;

  if (files.length === 0) return 0;

  // Agregar por zona
  const zoneMap = new Map<
    string,
    { fileSet: Set<string>; conflictCount: number; lastConflict: string }
  >();

  for (const f of files) {
    const zone = normalizeZone(f.file_path);
    const existing = zoneMap.get(zone);
    if (existing) {
      existing.fileSet.add(f.file_path);
      existing.conflictCount++;
      if (f.detected_at > existing.lastConflict) {
        existing.lastConflict = f.detected_at;
      }
    } else {
      zoneMap.set(zone, {
        fileSet: new Set([f.file_path]),
        conflictCount: 1,
        lastConflict: f.detected_at,
      });
    }
  }

  // Ordenar por conflict_count DESC
  const zones = [...zoneMap.entries()]
    .map(([zone, data]) => ({
      zone,
      file_count: data.fileSet.size,
      conflict_count: data.conflictCount,
      last_conflict: data.lastConflict,
    }))
    .sort((a, b) => b.conflict_count - a.conflict_count);

  const maxCount = zones[0]?.conflict_count ?? 1;
  const now = new Date().toISOString();

  const upsert = db.prepare(
    `INSERT INTO conflict_heat (zone, file_count, conflict_count, last_conflict, score, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const txn = db.transaction(() => {
    for (const z of zones) {
      const score =
        Math.round((z.conflict_count / maxCount) * 100) / 100;
      upsert.run(
        z.zone,
        z.file_count,
        z.conflict_count,
        z.last_conflict,
        score,
        now,
      );
    }
  });
  txn();

  return zones.length;
}

/**
 * Refresca conflict_age_risk (scoring por PR).
 * Fórmula: risk_score = (age_days × 0.4) + (file_count_normalized × 0.3) + (zone_weight × 0.3)
 * Spec §5.
 *
 * @param db - Conexión SQLite
 * @param now - Timestamp para calcular age_days (para replay determinista). Default: Date.now()
 */
export function refreshConflictAgeRisk(
  db: Database.Database,
  now?: number,
): number {
  db.prepare("DELETE FROM conflict_age_risk").run();

  const nowMs = now ?? Date.now();

  // PRs con conflicto activo
  const openConflicts = db
    .prepare(
      `SELECT cl.pr_number, cl.detected_at,
              COUNT(cf.file_path) AS file_count
       FROM conflict_lifecycle cl
       LEFT JOIN conflict_file cf ON cf.pr_number = cl.pr_number AND cf.conflict_id = cl.id
       WHERE cl.state = 'entered'
       GROUP BY cl.pr_number`,
    )
    .all() as Array<{
    pr_number: number;
    detected_at: string;
    file_count: number;
  }>;

  if (openConflicts.length === 0) return 0;

  const maxFiles = Math.max(...openConflicts.map((c) => c.file_count), 1);

  // Obtener peso máximo de zona por PR (desde conflict_heat)
  const zoneWeights = db
    .prepare(
      `SELECT cf.pr_number, MAX(ch.score) AS max_zone_score
       FROM conflict_file cf
       JOIN conflict_heat ch ON ch.zone = CASE
         WHEN instr(cf.file_path, '/') > 0 THEN
           substr(cf.file_path, 1, instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') + instr(cf.file_path, '/') - 1)
         ELSE '(root)'
       END
       WHERE cf.resolved_at IS NULL
       GROUP BY cf.pr_number`,
    )
    .all() as Array<{ pr_number: number; max_zone_score: number }>;

  const zoneMap = new Map(
    zoneWeights.map((z) => [z.pr_number, z.max_zone_score]),
  );

  const upsert = db.prepare(
    `INSERT INTO conflict_age_risk
       (pr_number, age_days, file_count, zone_score, risk_score, risk_level, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const txn = db.transaction(() => {
    for (const c of openConflicts) {
      const ageDays = (nowMs - Date.parse(c.detected_at)) / 86_400_000;
      const fileNorm = (c.file_count / maxFiles) * 100;
      const zoneW = (zoneMap.get(c.pr_number) ?? 0) * 100;
      const score = Math.min(
        100,
        Math.round(ageDays * 0.4 + fileNorm * 0.3 + zoneW * 0.3),
      );
      const level = classifyRisk(score);

      upsert.run(
        c.pr_number,
        ageDays,
        c.file_count,
        zoneW,
        score,
        level,
        new Date().toISOString(),
      );
    }
  });
  txn();

  return openConflicts.length;
}

/**
 * Ejecuta los tres refreshers en orden: hotspots → heat → ageRisk.
 * Útil tanto para el pipeline normal como para el replay engine.
 */
export function projectConflictFiles(
  db: Database.Database,
  now?: number,
): { hotspots: number; heat: number; ageRisk: number } {
  const hotspots = refreshConflictFileHotspots(db);
  const heat = refreshConflictHeat(db);
  const ageRisk = refreshConflictAgeRisk(db, now);
  return { hotspots, heat, ageRisk };
}
