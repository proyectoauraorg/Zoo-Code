import type { KanbanColumn } from "@/lib/types";

/** Columnas del PR Board, en orden de flujo (SPEC §7b). */
export const KANBAN_COLUMNS: KanbanColumn[] = [
  "Draft",
  "Review",
  "Changes Requested",
  "Approved",
  "Merged",
];

/**
 * Deriva la columna Kanban de un PR a partir de state + reviewDecision + isDraft.
 * Espejo exacto de `kanban_column()` en ingest/historian.py.
 *
 * MERGED → "Merged". CLOSED no se muestra en el board (se reporta como null).
 */
export function kanbanColumn(
  state: string,
  reviewDecision: string,
  isDraft: boolean,
): KanbanColumn | null {
  if (state === "MERGED") return "Merged";
  if (state === "CLOSED") return null;
  if (isDraft) return "Draft";
  if (reviewDecision === "CHANGES_REQUESTED") return "Changes Requested";
  if (reviewDecision === "APPROVED") return "Approved";
  return "Review"; // REVIEW_REQUIRED o ''
}

export interface PrColumnState {
  ts: string;
  state: string;
  reviewDecision: string;
  isDraft: boolean;
}

/**
 * ts de entrada a la columna ACTUAL de un PR: el más antiguo de la racha contigua
 * (que termina en el último snapshot) con la misma columna Kanban. Base del "aging".
 * `history` debe venir ordenada ascendente por ts. Función pura (sin DB) → testeable.
 */
export function columnEntryTs(history: PrColumnState[]): string | null {
  if (history.length === 0) return null;
  const latest = history[history.length - 1];
  const currentCol = kanbanColumn(
    latest.state,
    latest.reviewDecision,
    latest.isDraft,
  );
  let entry = latest.ts;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (kanbanColumn(h.state, h.reviewDecision, h.isDraft) === currentCol) {
      entry = h.ts;
    } else {
      break;
    }
  }
  return entry;
}
