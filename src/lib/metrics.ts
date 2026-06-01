// Instrumentación interna (V2.d.4) — captura latencias, contadores y recursos.
// Almacena en memoria (ring buffer) y persiste a SQLite periódicamente.
// Los datos se consumen via HealthRepo.getResourceHealth() y getApiHealth().

import fs from "node:fs";

// ── Contadores en memoria (sin DB overhead por request) ──

interface EndpointStats {
  requests: number;
  errors: number;
  totalLatencyMs: number;
}

const apiStats = new Map<string, EndpointStats>();

/** Registra un request completado (éxito o error). */
export function recordRequest(
  endpoint: string,
  latencyMs: number,
  isError: boolean,
) {
  const stats = apiStats.get(endpoint) ?? {
    requests: 0,
    errors: 0,
    totalLatencyMs: 0,
  };
  stats.requests++;
  stats.totalLatencyMs += latencyMs;
  if (isError) stats.errors++;
  apiStats.set(endpoint, stats);
}

/** Devuelve stats acumulados por endpoint (para ApiHealth). */
export function getApiStats(): Record<
  string,
  { avgLatencyMs: number; requests: number; errors: number; errorRate: number }
> {
  const result: Record<
    string,
    { avgLatencyMs: number; requests: number; errors: number; errorRate: number }
  > = {};
  for (const [endpoint, s] of apiStats) {
    result[endpoint] = {
      avgLatencyMs: s.requests > 0 ? Math.round(s.totalLatencyMs / s.requests) : 0,
      requests: s.requests,
      errors: s.errors,
      errorRate: s.requests > 0 ? Math.round((s.errors / s.requests) * 10000) / 100 : 0,
    };
  }
  return result;
}

/** Reset contadores (útil para tests). */
export function resetApiStats() {
  apiStats.clear();
}

// ── Métricas de recursos del proceso ──

export interface ResourceMetrics {
  memoryMb: number; // RSS
  heapUsedMb: number;
  heapTotalMb: number;
  uptimeS: number;
}

/** Lee métricas de recursos del proceso Node.js. */
export function getResourceMetrics(): ResourceMetrics {
  const mem = process.memoryUsage();
  return {
    memoryMb: Math.round(mem.rss / 1048576),
    heapUsedMb: Math.round(mem.heapUsed / 1048576),
    heapTotalMb: Math.round(mem.heapTotal / 1048576),
    uptimeS: Math.round(process.uptime()),
  };
}

/** Espacio libre en disco (KB) del directorio data/. */
export function getDiskFreeMb(): number | null {
  try {
    const stats = fs.statfsSync?.("./data");
    if (stats) return Math.round((stats.bavail * stats.bsize) / 1048576);
  } catch {
    // statfsSync no disponible o directorio no existe
  }
  return null;
}

// ── Wrapper de latencia para operaciones ──

/** Ejecuta una función midiendo su latencia en ms. */
export async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; latencyMs: number }> {
  const start = performance.now();
  const result = await fn();
  const latencyMs = Math.round((performance.now() - start) * 100) / 100;
  return { result, latencyMs };
}

/** Wrapper síncrono. */
export function timedSync<T>(fn: () => T): { result: T; latencyMs: number } {
  const start = performance.now();
  const result = fn();
  const latencyMs = Math.round((performance.now() - start) * 100) / 100;
  return { result, latencyMs };
}

// ── Persistencia a SQLite (llamar periodicamente o al hacer health check) ──

import { getDb } from "@/lib/db";

/** Persiste métricas acumuladas a internal_metric. Llamar cada ~60s o en health. */
export function persistMetrics() {
  const db = getDb();
  if (!db) return;

  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
  const resources = getResourceMetrics();

  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS internal_metric (
        ts TEXT NOT NULL DEFAULT (datetime('now')),
        key TEXT NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (ts, key)
      )`,
    );

    const insert = db.prepare(
      "INSERT OR IGNORE INTO internal_metric(ts, key, value) VALUES (?,?,?)",
    );

    const txn = db.transaction(() => {
      // Recursos
      insert.run(ts, "memory_mb", resources.memoryMb);
      insert.run(ts, "heap_used_mb", resources.heapUsedMb);
      insert.run(ts, "heap_total_mb", resources.heapTotalMb);

      const diskFree = getDiskFreeMb();
      if (diskFree !== null) insert.run(ts, "disk_free_mb", diskFree);

      // Contadores de API
      const stats = getApiStats();
      for (const [endpoint, s] of Object.entries(stats)) {
        insert.run(ts, `api_latency_ms:${endpoint}`, s.avgLatencyMs);
        insert.run(ts, `api_requests:${endpoint}`, s.requests);
        insert.run(ts, `api_errors:${endpoint}`, s.errors);
      }
    });

    txn();
  } catch {
    // no-op: métricas son best-effort
  }
}
