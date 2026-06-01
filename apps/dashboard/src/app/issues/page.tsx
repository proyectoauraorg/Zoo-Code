"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { IssueTable } from "@/components/IssueTable";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/skeletons";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { ErrorState } from "@/components/ui/error-state";
import { POLL_REFRESH_MS, fetchJson } from "@/lib/api";
import type { IssuesResponse } from "@/lib/types";

type Filter = "ALL" | "OPEN" | "CLOSED";
const FILTERS: SegmentedOption<Filter>[] = [
  { key: "ALL", label: "Todas" },
  { key: "OPEN", label: "Abiertas" },
  { key: "CLOSED", label: "Cerradas" },
];

export default function IssuesPage() {
  const [filter, setFilter] = useState<Filter>("OPEN");

  // Restaurar/persistir el filtro entre cargas.
  useEffect(() => {
    const stored = localStorage.getItem("issues-filter") as Filter | null;
    if (stored && ["ALL", "OPEN", "CLOSED"].includes(stored)) setFilter(stored);
  }, []);
  const changeFilter = (f: Filter) => {
    setFilter(f);
    try {
      localStorage.setItem("issues-filter", f);
    } catch {
      /* no-op */
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["issues"],
    queryFn: () => fetchJson<IssuesResponse>("/api/issues"),
    refetchInterval: POLL_REFRESH_MS,
  });

  const issues = (data?.issues ?? []).filter((i) =>
    filter === "ALL" ? true : i.state === filter,
  );

  return (
    <div>
      <PageHeader subtitle="Triage de issues sobre Zoo-Code-Org/Zoo-Code" />

      <div className="mb-4">
        <Segmented
          options={FILTERS}
          value={filter}
          onChange={changeFilter}
          ariaLabel="Filtrar por estado"
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState
          title="No se pudo cargar Issues"
          detail="Falló GET /api/issues."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="animate-fade-in">
          <IssueTable issues={issues} />
        </div>
      )}
    </div>
  );
}
