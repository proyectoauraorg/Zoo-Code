// Tests del parser de git merge-tree (V2.i). Spec §8.2.

import { describe, it, expect } from "vitest";
import {
  parseMergeTreeOutput,
  normalizeZone,
  classifyRisk,
} from "@/lib/conflict/merge-tree-parser";

describe("parseMergeTreeOutput", () => {
  it("extrae paths de CONFLICT (content)", () => {
    const output = `
CONFLICT (content): Merge conflict in src/lib/db.ts
CONFLICT (content): Merge conflict in src/app/api/conflicts/route.ts
    `;
    expect(parseMergeTreeOutput(output)).toEqual([
      "src/app/api/conflicts/route.ts",
      "src/lib/db.ts",
    ]);
  });

  it("extrae paths de 'changed in both'", () => {
    const output = `
changed in both
  base   100644 abc123 src/lib/db.ts
  our    100644 def456 src/lib/db.ts
  their  100644 ghi789 src/lib/db.ts
    `;
    expect(parseMergeTreeOutput(output)).toEqual(["src/lib/db.ts"]);
  });

  it("retorna vacío si no hay conflictos", () => {
    expect(parseMergeTreeOutput("")).toEqual([]);
    expect(parseMergeTreeOutput("some output without conflicts")).toEqual([]);
  });

  it("deduplica paths repetidos", () => {
    const output = `
CONFLICT (content): Merge conflict in src/lib/db.ts
changed in both
  base   100644 abc123 src/lib/db.ts
    `;
    expect(parseMergeTreeOutput(output)).toEqual(["src/lib/db.ts"]);
  });

  it("mezcla CONFLICT y changed in both con paths diferentes", () => {
    const output = `
CONFLICT (content): Merge conflict in src/lib/db.ts
changed in both
  base   100644 abc123 src/app/page.tsx
  our    100644 def456 src/app/page.tsx
  their  100644 ghi789 src/app/page.tsx
    `;
    expect(parseMergeTreeOutput(output)).toEqual([
      "src/app/page.tsx",
      "src/lib/db.ts",
    ]);
  });
});

describe("normalizeZone", () => {
  it("extrae 2 niveles de profundidad", () => {
    expect(normalizeZone("src/lib/db.ts")).toBe("src/lib");
    expect(normalizeZone("src/app/api/conflicts/route.ts")).toBe("src/app");
    expect(normalizeZone("ingest/historian.py")).toBe("ingest");
  });

  it("devuelve (root) si no tiene suficientes niveles", () => {
    expect(normalizeZone("package.json")).toBe("(root)");
    expect(normalizeZone("README.md")).toBe("(root)");
  });

  it("maneja paths con exactamente 2 segmentos", () => {
    expect(normalizeZone("deploy/launchd")).toBe("deploy");
  });
});

describe("classifyRisk", () => {
  it("low: score < 26", () => {
    expect(classifyRisk(0)).toBe("low");
    expect(classifyRisk(10)).toBe("low");
    expect(classifyRisk(25)).toBe("low");
  });

  it("medium: 26-50", () => {
    expect(classifyRisk(26)).toBe("medium");
    expect(classifyRisk(38)).toBe("medium");
    expect(classifyRisk(50)).toBe("medium");
  });

  it("high: 51-75", () => {
    expect(classifyRisk(51)).toBe("high");
    expect(classifyRisk(63)).toBe("high");
    expect(classifyRisk(75)).toBe("high");
  });

  it("critical: 76-100", () => {
    expect(classifyRisk(76)).toBe("critical");
    expect(classifyRisk(88)).toBe("critical");
    expect(classifyRisk(100)).toBe("critical");
  });
});
