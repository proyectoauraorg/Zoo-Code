// Projector: conflict_hotspot — materializa top archivos en conflicto.
// En v1, solo rastrea PRs con mergeable=CONFLICTING del snapshot actual.
// En v2.i (Fase B), enriquecerá con git merge-tree sobre clon read-only.

import { getDb } from "@/lib/db";

/**
 * Refresca la tabla conflict_hotspot con PRs actualmente en conflicto.
 * Acumula `times` (histórico) y actualiza `last_seen`.
 */
export function refreshConflictHotspot(): number {
  const db = getDb();
  if (!db) return 0;

  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

  // Obtener el último poll
  const latestPoll = db
    .prepare("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1")
    .get() as { ts: string } | undefined;
  if (!latestPoll) return 0;

  // PRs con mergeable=CONFLICTING del último poll
  const conflicting = db
    .prepare(
      `SELECT number, title
       FROM pr_snapshot
       WHERE ts = ? AND mergeable = 'CONFLICTING'`,
    )
    .all(latestPoll.ts) as Array<{ number: number; title: string }>;

  if (conflicting.length === 0) return 0;

  // En v1, usamos el número de PR como "path" simplificado.
  // En v2.i, git merge-tree proporcionará los archivos reales.
  const txn = db.transaction(() => {
    // Asegurar que la tabla existe (ya creada por schema.sql, pero por si acaso)
    db.prepare(
      `CREATE TABLE IF NOT EXISTS conflict_hotspot (
        path TEXT PRIMARY KEY,
        times INTEGER NOT NULL DEFAULT 0,
        last_seen TEXT,
        schema_version INTEGER NOT NULL DEFAULT 1
      )`,
    ).run();

    const upsert = db.prepare(
      `INSERT INTO conflict_hotspot (path, times, last_seen, schema_version)
       VALUES (?, 1, ?, 1)
       ON CONFLICT(path) DO UPDATE SET
         times = times + 1,
         last_seen = ?`,
    );

    for (const pr of conflicting) {
      const path = `PR#${pr.number}`;
      upsert.run(path, now, now);
    }
  });

  txn();
  return conflicting.length;
}
