"use client";

import { useQuery } from "@tanstack/react-query";

import { AgeRiskBadge } from "@/components/AgeRiskBadge";
import { ConflictFileTable } from "@/components/ConflictFileTable";
import { HeatGraph } from "@/components/HeatGraph";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { POLL_REFRESH_MS, fetchJson, relativeTime } from "@/lib/api";

interface ConflictFileEntry {
  path: string;
  detectedAt: string;
  resolvedAt: string | null;
}

interface AgeRiskEntry {
  prNumber: number;
  ageDays: number;
  fileCount: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface ConflictEntry {
  prNumber: number;
  title: string;
  state: string;
  detectedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  files: ConflictFileEntry[];
  ageRisk: AgeRiskEntry | null;
}

interface HotspotEntry {
  path: string;
  times: number;
  lastSeen: string;
}

interface HeatZoneEntry {
  zone: string;
  fileCount: number;
  conflictCount: number;
  score: number;
}

interface ConflictsResponse {
  ok: boolean;
  open: ConflictEntry[];
  resolved: ConflictEntry[];
  hotspots: HotspotEntry[];
  heat: HeatZoneEntry[];
  ageRisk: AgeRiskEntry[];
}

function formatDuration(s: number | null): string {
  if (s === null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default function ConflictsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["conflicts"],
    queryFn: () => fetchJson<ConflictsResponse>("/api/conflicts"),
    refetchInterval: POLL_REFRESH_MS,
  });

  if (isLoading)
    return (
      <div>
        <PageHeader subtitle="Conflict Tracker" />
        <TableSkeleton />
      </div>
    );
  if (isError || !data)
    return (
      <div>
        <PageHeader subtitle="Conflict Tracker" />
        <ErrorState
          title="No se pudieron cargar conflictos"
          detail="Falló GET /api/conflicts."
          onRetry={() => refetch()}
        />
      </div>
    );

  const hasData =
    data.open.length > 0 ||
    data.resolved.length > 0 ||
    data.hotspots.length > 0 ||
    (data.heat?.length ?? 0) > 0;

  const totalHotspots = data.hotspots.length;
  const hasFiles = data.hotspots.some((h) => !h.path.startsWith("PR#"));

  return (
    <div>
      <PageHeader
        subtitle={`${data.open.length} conflicto(s) abierto(s) · ${totalHotspots} hotspot(s)`}
      />

      {!hasData ? (
        <EmptyState
          icon="⚔️"
          title="Sin conflictos detectados"
          description="El event_log no contiene eventos de conflicto todavía."
        />
      ) : (
        <div className="animate-fade-in space-y-6">
          {/* Conflictos abiertos */}
          {data.open.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-fg">
                🔴 Conflictos abiertos
              </h3>
              <Table>
                <THead>
                  <TR>
                    <TH>PR</TH>
                    <TH>Título</TH>
                    <TH>Desde</TH>
                    <TH className="text-center">Riesgo</TH>
                    <TH className="text-right">Duración</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.open.map((c) => (
                    <TR key={c.prNumber}>
                      <TD className="font-mono text-fg-subtle">
                        #{c.prNumber}
                      </TD>
                      <TD className="max-w-md truncate text-fg">
                        {c.title || "—"}
                      </TD>
                      <TD className="text-xs text-fg-muted">
                        {relativeTime(c.detectedAt)}
                      </TD>
                      <TD className="text-center">
                        {c.ageRisk ? (
                          <AgeRiskBadge risk={c.ageRisk} />
                        ) : (
                          <span className="text-xs text-fg-muted">—</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Badge variant="danger">
                          {formatDuration(c.durationSeconds)}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              {/* Archivos por conflicto (expandible) */}
              {data.open.some((c) => c.files.length > 0) && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-medium text-fg-muted">
                    Archivos afectados por PR:
                  </h4>
                  {data.open
                    .filter((c) => c.files.length > 0)
                    .map((c) => (
                      <div
                        key={c.prNumber}
                        className="ml-2 rounded border border-line p-2"
                      >
                        <span className="font-mono text-xs text-fg-subtle">
                          PR#{c.prNumber}
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {c.files.map((f) => (
                            <li
                              key={f.path}
                              className="ml-4 font-mono text-xs text-fg"
                            >
                              📄 {f.path}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          )}

          {/* Hotspots V2.i: tabla de hotspots con paths reales */}
          {hasFiles && (
            <Card className="p-4">
              <ConflictFileTable hotspots={data.hotspots} />
            </Card>
          )}

          {/* Heat Graph V2.i */}
          {(data.heat?.length ?? 0) > 0 && (
            <Card className="p-4">
              <HeatGraph heat={data.heat} />
            </Card>
          )}

          {/* Age Risk V2.i — lista completa */}
          {(data.ageRisk?.length ?? 0) > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-fg">
                ⚡ Age Risk — priorización de conflictos
              </h3>
              <Table>
                <THead>
                  <TR>
                    <TH>PR</TH>
                    <TH className="text-center">Días</TH>
                    <TH className="text-center">Archivos</TH>
                    <TH className="text-center">Score</TH>
                    <TH>Nivel</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.ageRisk.map((ar) => (
                    <TR key={ar.prNumber}>
                      <TD className="font-mono text-fg-subtle">
                        #{ar.prNumber}
                      </TD>
                      <TD className="text-center tabular-nums text-fg-muted">
                        {ar.ageDays.toFixed(1)}
                      </TD>
                      <TD className="text-center tabular-nums text-fg-muted">
                        {ar.fileCount}
                      </TD>
                      <TD className="text-center tabular-nums font-medium">
                        {ar.riskScore}
                      </TD>
                      <TD>
                        <AgeRiskBadge risk={ar} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}

          {/* Hotspots legacy (si no hay archivos reales) */}
          {!hasFiles && data.hotspots.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-fg">
                🔥 Hotspots (PRs más conflictivos)
              </h3>
              <Table>
                <THead>
                  <TR>
                    <TH>PR</TH>
                    <TH className="text-center">Conflictos</TH>
                    <TH className="text-right">Último</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.hotspots.map((h) => (
                    <TR key={h.path}>
                      <TD className="font-mono text-fg-subtle">{h.path}</TD>
                      <TD className="text-center">
                        <Badge
                          variant={h.times >= 3 ? "danger" : "warning"}
                        >
                          {h.times}
                        </Badge>
                      </TD>
                      <TD className="text-right text-xs text-fg-muted">
                        {relativeTime(h.lastSeen)}
                      </TD>
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
