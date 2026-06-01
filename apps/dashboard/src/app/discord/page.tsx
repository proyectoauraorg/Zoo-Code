"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { POLL_REFRESH_MS, fetchJson, relativeTime } from "@/lib/api";
import type { DiscordResponse } from "@/lib/types";

const DiscordChart = dynamic(
  () => import("@/components/DiscordChart").then((m) => m.DiscordChart),
  { ssr: false },
);

export default function DiscordPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["discord"],
    queryFn: () => fetchJson<DiscordResponse>("/api/discord"),
    refetchInterval: POLL_REFRESH_MS,
  });

  const hasData = (data?.totalMessages ?? 0) > 0;

  return (
    <div>
      <PageHeader
        subtitle={
          data
            ? data.fresh
              ? `${data.totalMessages} mensajes — intake ${relativeTime(data.lastIntake)}`
              : "Sin intake reciente (>48h). Ejecuta `make context-discord`."
            : "Actividad de la comunidad en Discord"
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar Discord"
          detail="Falló GET /api/discord."
          onRetry={() => refetch()}
        />
      ) : !hasData ? (
        <EmptyState
          icon="💬"
          title="Sin actividad de Discord"
          description="El intake de Discord está vacío. Ejecuta `make context-discord` en zSys para generar discord.json."
        />
      ) : (
        <div className="animate-fade-in space-y-6">
          {/* Health + KPIs */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={data!.fresh ? "success" : "warning"}>
              {data!.fresh ? "🟢 Intake activo" : "🟡 Intake stale"}
            </Badge>
            <span className="text-xs text-fg-muted">
              Último dato: {relativeTime(data!.lastIntake)}
            </span>
          </div>

          {/* Chart + Top lists */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <DiscordChart series={data!.series} />
            </div>
            <div className="lg:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Top canales */}
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-fg">
                  Top canales
                </h3>
                <Table>
                  <THead>
                    <TR>
                      <TH>Canal</TH>
                      <TH className="text-right">Msgs</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data!.byChannel.map((ch) => (
                      <TR key={ch.channel}>
                        <TD className="font-medium text-fg">
                          #{ch.channel}
                        </TD>
                        <TD className="text-right tabular-nums text-fg-muted">
                          {ch.count}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>

              {/* Top usuarios */}
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-fg">
                  Top usuarios
                </h3>
                <Table>
                  <THead>
                    <TR>
                      <TH>Usuario</TH>
                      <TH className="text-right">Msgs</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data!.byUser.map((u) => (
                      <TR key={u.user}>
                        <TD className="font-medium text-fg">{u.user}</TD>
                        <TD className="text-right tabular-nums text-fg-muted">
                          {u.count}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
