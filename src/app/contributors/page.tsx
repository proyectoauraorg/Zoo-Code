"use client";

import { useQuery } from "@tanstack/react-query";

import { ContributorTable } from "@/components/ContributorTable";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { POLL_REFRESH_MS, fetchJson } from "@/lib/api";
import type { ContributorsResponse } from "@/lib/types";

export default function ContributorsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["contributors"],
    queryFn: () => fetchJson<ContributorsResponse>("/api/contributors"),
    refetchInterval: POLL_REFRESH_MS,
  });

  const contributors = data?.contributors ?? [];
  const bf = data?.busFactor;

  const busFactorWarning = (bf?.factor ?? 0) <= 2 && (bf?.factor ?? 0) > 0;

  return (
    <div>
      <PageHeader
        subtitle={
          bf && bf.factor > 0
            ? `Bus Factor: ${bf.factor} autor(es) cubren el 50% de PRs — top: ${bf.topAuthor} (${bf.topSharePct}%)`
            : "Actividad de contribución sobre Zoo-Code-Org/Zoo-Code"
        }
      />

      {/* Bus Factor card */}
      {bf && bf.factor > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card
            className={`p-4 ${busFactorWarning ? "border-warning" : ""}`}
          >
            <p className="text-sm text-fg-muted">Bus Factor</p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${
                busFactorWarning ? "text-warning" : "text-success"
              }`}
            >
              {bf.factor}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              autores para el 50% de PRs
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-sm text-fg-muted">Top autor</p>
            <p className="mt-1 text-lg font-semibold text-fg">
              {bf.topAuthor}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {bf.topSharePct}% del total
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-sm text-fg-muted">Distribución</p>
            <div className="mt-2 space-y-1">
              {bf.distribution.slice(0, 5).map((d) => (
                <div key={d.login} className="flex items-center gap-2">
                  <span className="w-24 truncate text-xs text-fg-muted">
                    {d.login}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${d.sharePct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-fg-subtle">
                    {d.sharePct}%
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {busFactorWarning && (
        <Card className="mb-4 border-warning bg-warning-bg p-3 text-sm text-warning">
          <span aria-hidden>⚠</span>{" "}
          Concentración alta: solo {bf!.factor} autor(es) cubren el 50% de PRs.
          Riesgo de dependencia.
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState
          title="No se pudieron cargar los contribuidores"
          detail="Falló GET /api/contributors."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="animate-fade-in">
          <ContributorTable contributors={contributors} />
        </div>
      )}
    </div>
  );
}
