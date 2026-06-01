// Projector: system_snapshot — materializa snapshot de salud del sistema.
// Cachea health/KPIs para lectura rápida sin recalcular.

import { getDb } from "@/lib/db";
import { buildSystemHealth } from "@/lib/system-health";

/**
 * Refresca la tabla system_snapshot con las métricas actuales.
 * Cada clave se almacena como JSON en la columna `value`.
 */
export function refreshSystemSnapshot(): number {
  const db = getDb();
  if (!db) return 0;

  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  const health = buildSystemHealth();

  const entries: Array<[string, unknown]> = [
    ["status", health.status],
    ["snapshot_age_s", health.snapshot.ageSeconds],
    ["snapshot_ok", health.snapshot.ok],
    ["db_ok", health.database.ok],
    ["db_latency_ms", health.database.latencyMs],
    ["historian_last_run_s", health.historian.lastRunSecondsAgo],
    ["api_requests_total", health.api.requestsTotal],
    ["api_errors_total", health.api.errorsTotal],
    ["api_error_rate", health.api.errorRate],
    ["api_avg_latency_ms", health.api.avgLatencyMs],
    ["memory_mb", health.resources.memoryMb],
    ["heap_used_mb", health.resources.heapUsedMb],
    ["disk_free_mb", health.resources.diskFreeMb],
    ["uptime_s", health.uptimeS],
    ["freshness", health.freshness],
  ];

  const txn = db.transaction(() => {
    db.prepare("DELETE FROM system_snapshot").run();
    const insert = db.prepare(
      `INSERT INTO system_snapshot (key, value, refreshed_at, schema_version)
       VALUES (?, ?, ?, 1)`,
    );
    for (const [key, val] of entries) {
      insert.run(key, JSON.stringify(val), now);
    }
  });

  txn();
  return entries.length;
}
