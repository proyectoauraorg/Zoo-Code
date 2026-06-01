"use client";

import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import { MobileNav } from "@/components/MobileNav";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { POLL_REFRESH_MS, fetchJson, relativeTime } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/prs": "PR Board",
  "/contributors": "Contributors",
  "/discord": "Discord",
  "/conflicts": "Conflicts",
  "/alerts": "Alerts",
  "/issues": "Issues",
  "/system": "System",
};
const UPSTREAM = "https://github.com/Zoo-Code-Org/Zoo-Code";

/** Header operacional global (sticky): sección activa + salud del snapshot +
 *  acciones (refresh, upstream, tema). Comparte la query ["overview"] con el Overview. */
export function AppHeader() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "ZooDash";
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<HealthResponse>("/api/health"),
    refetchInterval: POLL_REFRESH_MS,
  });
  const ok = data?.ok ?? true;
  const stale = data?.stale ?? false;
  const dotColor = !ok ? "bg-danger" : stale ? "bg-warning" : "bg-success";
  const statusText = !data
    ? "snapshot …"
    : !ok
      ? "snapshot no disponible"
      : stale
        ? `snapshot stale · ${relativeTime(data.fetchedAt)}`
        : `snapshot ${relativeTime(data.fetchedAt)}`;

  return (
    <header className="sticky top-0 z-10 -mx-4 mb-6 flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3 sm:-mx-8 sm:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        <h1 className="truncate text-base font-semibold text-fg">{title}</h1>
        <span
          className="hidden items-center gap-1.5 text-xs text-fg-muted sm:flex"
          aria-live="polite"
        >
          <span
            className={
              "inline-block h-1.5 w-1.5 rounded-full " +
              dotColor +
              (fetching ? " animate-pulse" : "")
            }
            aria-hidden
          />
          {statusText}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => qc.invalidateQueries()}
          disabled={fetching}
          aria-label="Refrescar datos"
        >
          <span aria-hidden className={fetching ? "animate-spin" : ""}>
            ↻
          </span>
          <span className="hidden sm:inline">
            {fetching ? "Actualizando…" : "Refrescar"}
          </span>
        </Button>
        <a
          href={UPSTREAM}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label="Abrir el repositorio en GitHub"
        >
          <span aria-hidden>↗</span>
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
