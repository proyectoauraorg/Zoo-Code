"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { PrKanban } from "@/components/PrKanban";
import { KanbanSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { POLL_REFRESH_MS, fetchJson } from "@/lib/api";
import type { PrsResponse } from "@/lib/types";

export default function PrBoardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["prs"],
    queryFn: () => fetchJson<PrsResponse>("/api/prs"),
    refetchInterval: POLL_REFRESH_MS,
  });

  const bottlenecks =
    data?.prs.filter(
      (p) =>
        p.column !== "Merged" &&
        (p.ci.state === "fail" ||
          p.mergeable === "CONFLICTING" ||
          (p.agingDays ?? 0) >= 7),
    ).length ?? 0;

  return (
    <div>
      <PageHeader
        subtitle={
          bottlenecks > 0
            ? `${bottlenecks} PR(s) en bottleneck (CI roja, conflicto o aging alto)`
            : "Flujo de PRs por estado"
        }
      />

      {isLoading ? (
        <KanbanSkeleton />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar el PR Board"
          detail="Falló GET /api/prs."
          onRetry={() => refetch()}
        />
      ) : !data || data.prs.length === 0 ? (
        <EmptyState
          icon="🔀"
          title="Sin PRs para mostrar"
          description="El snapshot no reporta PRs abiertos ni mergeados en estas columnas."
        />
      ) : (
        <div className="animate-fade-in">
          <PrKanban columns={data.columns} prs={data.prs} />
        </div>
      )}
    </div>
  );
}
