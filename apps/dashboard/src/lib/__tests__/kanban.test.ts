import { describe, expect, it } from "vitest";

import {
  columnEntryTs,
  kanbanColumn,
  type PrColumnState,
} from "@/lib/kanban";

describe("kanbanColumn", () => {
  it("MERGED → Merged", () => {
    expect(kanbanColumn("MERGED", "APPROVED", false)).toBe("Merged");
  });
  it("CLOSED → null (no se muestra en el board)", () => {
    expect(kanbanColumn("CLOSED", "", false)).toBeNull();
  });
  it("OPEN + draft → Draft (draft tiene prioridad sobre reviewDecision)", () => {
    expect(kanbanColumn("OPEN", "APPROVED", true)).toBe("Draft");
  });
  it("OPEN + CHANGES_REQUESTED → Changes Requested", () => {
    expect(kanbanColumn("OPEN", "CHANGES_REQUESTED", false)).toBe(
      "Changes Requested",
    );
  });
  it("OPEN + APPROVED → Approved", () => {
    expect(kanbanColumn("OPEN", "APPROVED", false)).toBe("Approved");
  });
  it("OPEN + REVIEW_REQUIRED → Review", () => {
    expect(kanbanColumn("OPEN", "REVIEW_REQUIRED", false)).toBe("Review");
  });
  it("OPEN + reviewDecision vacío → Review", () => {
    expect(kanbanColumn("OPEN", "", false)).toBe("Review");
  });
});

describe("columnEntryTs (aging)", () => {
  it("devuelve el ts más antiguo de la racha contigua en la columna actual", () => {
    const history: PrColumnState[] = [
      // Draft
      { ts: "2026-05-01T00:00:00Z", state: "OPEN", reviewDecision: "", isDraft: true },
      // entra a Review aquí ↓
      { ts: "2026-05-02T00:00:00Z", state: "OPEN", reviewDecision: "REVIEW_REQUIRED", isDraft: false },
      { ts: "2026-05-03T00:00:00Z", state: "OPEN", reviewDecision: "", isDraft: false },
    ];
    expect(columnEntryTs(history)).toBe("2026-05-02T00:00:00Z");
  });

  it("ignora apariciones previas en la misma columna si hubo otra columna en medio", () => {
    const history: PrColumnState[] = [
      { ts: "2026-05-01T00:00:00Z", state: "OPEN", reviewDecision: "REVIEW_REQUIRED", isDraft: false }, // Review
      { ts: "2026-05-02T00:00:00Z", state: "OPEN", reviewDecision: "CHANGES_REQUESTED", isDraft: false }, // Changes Requested
      { ts: "2026-05-03T00:00:00Z", state: "OPEN", reviewDecision: "REVIEW_REQUIRED", isDraft: false }, // Review otra vez
    ];
    // la racha actual de "Review" empieza en 05-03, no en 05-01
    expect(columnEntryTs(history)).toBe("2026-05-03T00:00:00Z");
  });

  it("un solo snapshot → su propio ts", () => {
    expect(
      columnEntryTs([
        { ts: "2026-05-05T00:00:00Z", state: "OPEN", reviewDecision: "", isDraft: false },
      ]),
    ).toBe("2026-05-05T00:00:00Z");
  });

  it("historia vacía → null", () => {
    expect(columnEntryTs([])).toBeNull();
  });
});
