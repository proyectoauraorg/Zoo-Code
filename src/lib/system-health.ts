// System Health aggregator (V2.d.3) — compone señales de salud en un modelo unificado.

import { getDb } from "@/lib/db";
import { getApiStats, getResourceMetrics, getDiskFreeMb } from "@/lib/metrics";
import { readGithubHealth } from "@/lib/snapshots";
import type { SystemHealthData, SystemStatus } from "@/lib/types";

const STALE_THRESHOLD_S = 15 * 60;   // 15 min
const CRITICAL_THRESHOLD_S = 60 * 60; // 1 hora

/** Regla de decisión de estado global. */
export function computeStatus(input: {
  dbOk: boolean;
  errorRate: number;
  snapshotAgeS: number | null;
  p95Latency: number;
}): SystemStatus {
  if (!input.dbOk || input.errorRate > 0.2) return "critical";
  if (
    (input.snapshotAgeS !== null && input.snapshotAgeS > CRITICAL_THRESHOLD_S) ||
    input.errorRate > 0.05 ||
    input.p95Latency > 1000
  )
    return "degraded";
  return "healthy";
}

/** Construye el modelo de salud completo. */
export function buildSystemHealth(): SystemHealthData {
  // Snapshot
  const gh = readGithubHealth();
  const snapshotAgeS =
    gh?.fetchedAt && !Number.isNaN(Date.parse(gh.fetchedAt))
      ? Math.max(0, Math.floor((Date.now() - Date.parse(gh.fetchedAt)) / 1000))
      : null;

  // Database
  const db = getDb();
  let dbLatencyMs: number | null = null;
  if (db) {
    const start = performance.now();
    try {
      db.prepare("SELECT 1").get();
      dbLatencyMs = Math.round((performance.now() - start) * 100) / 100;
    } catch {
      dbLatencyMs = null;
    }
  }

  // Historian
  let lastRunSecondsAgo: number | null = null;
  if (db) {
    try {
      const row = db
        .prepare("SELECT MAX(ts) AS last_ts FROM poll")
        .get() as { last_ts: string | null } | undefined;
      if (row?.last_ts) {
        lastRunSecondsAgo = Math.max(
          0,
          Math.floor((Date.now() - Date.parse(row.last_ts)) / 1000),
        );
      }
    } catch {
      // tabla no existe
    }
  }

  // API stats
  const apiRaw = getApiStats();
  let totalRequests = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  for (const s of Object.values(apiRaw)) {
    totalRequests += s.requests;
    totalErrors += s.errors;
    totalLatency += s.avgLatencyMs * s.requests;
  }
  const avgLatency =
    totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;
  const errorRate =
    totalRequests > 0
      ? Math.round((totalErrors / totalRequests) * 10000) / 100
      : 0;

  // Resources
  const res = getResourceMetrics();
  const diskFreeMb = getDiskFreeMb();

  // Freshness
  const fresh =
    snapshotAgeS === null
      ? "critical"
      : snapshotAgeS > CRITICAL_THRESHOLD_S
        ? "critical"
        : snapshotAgeS > STALE_THRESHOLD_S
          ? "stale"
          : "ok";

  // Status
  const status = computeStatus({
    dbOk: db !== null && dbLatencyMs !== null,
    errorRate: errorRate / 100,
    snapshotAgeS,
    p95Latency: avgLatency * 1.5, // approx p95
  });

  return {
    status,
    snapshot: {
      ageSeconds: snapshotAgeS,
      ok: gh !== null && (gh?.ok ?? false),
    },
    database: {
      ok: db !== null,
      latencyMs: dbLatencyMs,
      driver: "sqlite",
    },
    historian: {
      lastRunSecondsAgo: lastRunSecondsAgo,
      lagPolls: 0, // TODO: calcular polls pendientes
    },
    api: {
      requestsTotal: totalRequests,
      errorsTotal: totalErrors,
      errorRate,
      avgLatencyMs: avgLatency,
      perEndpoint: apiRaw,
    },
    resources: {
      memoryMb: res.memoryMb,
      heapUsedMb: res.heapUsedMb,
      heapTotalMb: res.heapTotalMb,
      diskFreeMb,
      uptimeS: res.uptimeS,
    },
    freshness: fresh as SystemHealthData["freshness"],
    uptimeS: res.uptimeS,
  };
}
