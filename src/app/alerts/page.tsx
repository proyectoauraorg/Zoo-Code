"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { POLL_REFRESH_MS, fetchJson, relativeTime } from "@/lib/api";

interface AlertRow {
  id: number;
  ruleId: string;
  severity: string;
  message: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
}

interface AlertsResponse {
  ok: boolean;
  alerts: AlertRow[];
  newCount: number;
}

const SEV_BADGE: Record<string, "danger" | "warning" | "info"> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchJson<AlertsResponse>("/api/alerts"),
    refetchInterval: POLL_REFRESH_MS,
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) =>
      fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  if (isLoading) return <div><PageHeader subtitle="Alerting Engine" /><TableSkeleton /></div>;
  if (isError || !data) return <div><PageHeader subtitle="Alerting Engine" /><ErrorState title="No se pudieron cargar alertas" detail="Falló GET /api/alerts." onRetry={() => refetch()} /></div>;

  const openAlerts = data.alerts.filter((a) => a.status === "open");
  const resolvedAlerts = data.alerts.filter((a) => a.status === "resolved");

  return (
    <div>
      <PageHeader subtitle={`${openAlerts.length} alerta(s) abierta(s)${data.newCount > 0 ? ` · ${data.newCount} nueva(s)` : ""}`} />

      {openAlerts.length === 0 && resolvedAlerts.length === 0 ? (
        <EmptyState icon="🔔" title="Sin alertas" description="El engine de alerting no ha detectado ninguna condición." />
      ) : (
        <div className="animate-fade-in space-y-6">
          {/* Alertas abiertas */}
          {openAlerts.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-fg">🔴 Alertas abiertas</h3>
              <Table>
                <THead><TR><TH>Regla</TH><TH>Mensaje</TH><TH>Severidad</TH><TH>Desde</TH><TH className="text-right">Acción</TH></TR></THead>
                <TBody>
                  {openAlerts.map((a) => (
                    <TR key={a.id}>
                      <TD className="font-mono text-xs text-fg-subtle">{a.ruleId}</TD>
                      <TD className="max-w-md text-fg">{a.message}</TD>
                      <TD><Badge variant={SEV_BADGE[a.severity] ?? "warning"}>{a.severity}</Badge></TD>
                      <TD className="text-xs text-fg-muted">{relativeTime(a.openedAt)}</TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => resolveMut.mutate(a.id)} disabled={resolveMut.isPending}>
                          Resolver
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}

          {/* Alertas resueltas recientes */}
          {resolvedAlerts.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-fg-subtle">✅ Resueltas recientes</h3>
              <Table>
                <THead><TR><TH>Regla</TH><TH>Mensaje</TH><TH>Resuelta</TH></TR></THead>
                <TBody>
                  {resolvedAlerts.slice(0, 10).map((a) => (
                    <TR key={a.id}>
                      <TD className="font-mono text-xs text-fg-subtle">{a.ruleId}</TD>
                      <TD className="max-w-md text-fg-muted line-through">{a.message}</TD>
                      <TD className="text-xs text-fg-subtle">{relativeTime(a.resolvedAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
