import { PrCard } from "@/components/PrCard";
import type { KanbanColumn, PrCardData } from "@/lib/types";

const COLUMN_ACCENT: Record<KanbanColumn, string> = {
  Draft: "bg-draft",
  Review: "bg-info",
  "Changes Requested": "bg-warning",
  Approved: "bg-success",
  Merged: "bg-merged",
};

export function PrKanban({
  columns,
  prs,
}: {
  columns: KanbanColumn[];
  prs: PrCardData[];
}) {
  const byColumn = new Map<KanbanColumn, PrCardData[]>();
  for (const c of columns) byColumn.set(c, []);
  for (const pr of prs) byColumn.get(pr.column)?.push(pr);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {columns.map((col) => {
        const cards = byColumn.get(col) ?? [];
        return (
          <section
            key={col}
            className="flex flex-col rounded-lg border border-line bg-surface-muted"
            aria-label={`${col} (${cards.length})`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${COLUMN_ACCENT[col]}`}
                  aria-hidden
                />
                <span className="text-sm font-semibold text-fg">{col}</span>
              </div>
              <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium tabular-nums text-fg-muted">
                {cards.length}
              </span>
            </div>
            <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
              {cards.length === 0 ? (
                <li className="px-1 py-4 text-center text-xs text-fg-subtle">
                  —
                </li>
              ) : (
                cards.map((pr) => (
                  <li key={pr.number}>
                    <PrCard pr={pr} />
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
