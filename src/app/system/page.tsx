"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { POLL_REFRESH_MS, fetchJson, relativeTime } from "@/lib/api";
import type { SystemHealthData } from "@/lib/types";

const STATUS_META: Record<
  SystemHealthData["status"],
  { icon: string; label: string; variant: "success" | "warning" | "danger" }
> = {
  healthy: { icon: "🟢", label: "HEALTHY", variant: "success" },
  degraded: { icon: "🟡", label: "DEGRADED", variant: "warning" },
  critical: { icon: "🔴", label: "CRITICAL", variant: "danger" },
};

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function SystemPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => fetchJson<SystemHealthData>("/api/system-health"),
    refetchInterval: POLL_REFRESH_MS,
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader subtitle="System Health" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div>
        <PageHeader subtitle="System Health" />
        <ErrorState
          title="No se pudo cargar System Health"
          detail="Falló GET /api/system-health."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const sm = STATUS_META[data.status];

  return (
    <div>
      <PageHeader subtitle="Observabilidad operativa del propio ZooDash" />

      <div className="animate-fade-in space-y-6">
        {/* Status global */}
        <Card className="flex items-center gap-4 p-4">
          <span className="text-3xl">{sm.icon}</span>
          <div>
            <Badge variant={sm.variant}>{sm.label}</Badge>
            <p className="mt-1 text-xs text-fg-muted">
              uptime {formatUptime(data.uptimeS)} · snapshot{" "}
              {relativeTime(
                data.snapshot.ageSeconds !== null
                  ? new Date(
                      Date.now() - data.snapshot.ageSeconds * 1000,
                    ).toISOString()
                  : null,
              )}
            </p>
          </div>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-sm text-fg-muted">DB</p>
            <p
              className={`mt-1 text-2xl font-semibold ${data.database.ok ? "text-success" : "text-danger"}`}
            >
              {data.database.ok ? "OK" : "DOWN"}
            </p>
            <p className="text-xs text-fg-subtle">
              {data.database.latencyMs ?? "—"}ms
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-fg-muted">Error rate</p>
            <p
              className={`mt-1 text-2xl font-semibold ${data.api.errorRate > 5 ? "text-danger" : data.api.errorRate > 1 ? "text-warning" : "text-fg"}`}
            >
              {data.api.errorRate}%
            </p>
            <p className="text-xs text-fg-subtle">
              {data.api.errorsTotal}/{data.api.requestsTotal} requests
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-fg-muted">Memoria</p>
            <p className="mt-1 text-2xl font-semibold text-fg">
              {data.resources.memoryMb}MB
            </p>
            <p className="text-xs text-fg-subtle">
              heap {data.resources.heapUsedMb}/{data.resources.heapTotalMb}MB
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-fg-muted">Disco libre</p>
            <p
              className={`mt-1 text-2xl font-semibold ${data.resources.diskFreeMb !== null && data.resources.diskFreeMb < 1024 ? "text-danger" : "text-fg"}`}
            >
              {data.resources.diskFreeMb !== null
                ? `${Math.round(data.resources.diskFreeMb / 1024)}GB`
                : "—"}
            </p>
            <p className="text-xs text-fg-subtle">data/</p>
          </Card>
        </div>

        {/* Latencias por endpoint */}
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-fg">
            Latencias por endpoint
          </h3>
          <Table>
            <THead>
              <TR>
                <TH>Endpoint</TH>
                <TH className="text-right">Avg (ms)</TH>
                <TH className="text-right">Requests</TH>
                <TH className="text-right">Errors</TH>
                <TH className="text-right">Error %</TH>
              </TR>
            </THead>
            <TBody>
              {Object.entries(data.api.perEndpoint)
                .sort(([, a], [, b]) => b.avgLatencyMs - a.avgLatencyMs)
                .map(([endpoint, s]) => (
                  <TR key={endpoint}>
                    <TD className="font-mono text-xs text-fg">{endpoint}</TD>
                    <TD className="text-right tabular-nums">
                      {s.avgLatencyMs}ms
                    </TD>
                    <TD className="text-right tabular-nums text-fg-muted">
                      {s.requests}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s.errors > 0 ? (
                        <span className="text-danger">{s.errors}</span>
                      ) : (
                        <span className="text-fg-subtle">0</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s.errorRate > 0 ? (
                        <span className="text-danger">{s.errorRate}%</span>
                      ) : (
                        <span className="text-fg-subtle">0%</span>
                      )}
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
