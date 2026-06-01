"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

import { ActivityFeed } from "@/components/ActivityFeed";
import { DriftBadge } from "@/components/DriftBadge";
import { KpiCards } from "@/components/KpiCards";
import { PageHeader } from "@/components/PageHeader";
import { OverviewSkeleton } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { POLL_REFRESH_MS, fetchJson } from "@/lib/api";
import type { OverviewResponse } from "@/lib/types";

// Code-split: el chart (Tremor/recharts) se carga aparte, fuera del First Load de "/".
const Sparkline = dynamic(
  () => import("@/components/Sparkline").then((m) => m.Sparkline),
  {
    ssr: false,
    loading: () => (
      <Card className="flex h-[88px] items-center justify-between p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-12" />
        </div>
        <Skeleton className="h-12 w-40" />
      </Card>
    ),
  },
);

export default function OverviewPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: () => fetchJson<OverviewResponse>("/api/overview"),
    refetchInterval: POLL_REFRESH_MS,
  });

  return (
    <div>
      <PageHeader subtitle="Estado de contribución sobre Zoo-Code-Org/Zoo-Code 🦓" />

      {isLoading ? (
        <OverviewSkeleton />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar el Overview"
          detail="Falló GET /api/overview."
          onRetry={() => refetch()}
        />
      ) : !data?.raw ? (
        <ErrorState
          title="Snapshot no disponible"
          detail="No se pudo leer github.json. ¿Está corriendo el Context-Sync Runtime?"
          onRetry={() => refetch()}
        />
      ) : (
        <div className="animate-fade-in space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <DriftBadge drift={data.drift} />
            {data.release ? (
              <span className="text-xs text-fg-muted">
                release{" "}
                <span className="font-mono font-medium text-fg">
                  {data.release}
                </span>
              </span>
            ) : null}
          </div>

          <KpiCards raw={data.raw} mergedThisWeek={data.mergedThisWeek} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Sparkline series={data.series} />
            </div>
            <div className="lg:col-span-2">
              <ActivityFeed feed={data.feed} events={data.recentEvents} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
