// Tests del scoring de age risk (V2.i). Spec §5.

import { describe, it, expect } from "vitest";
import { classifyRisk } from "@/lib/conflict/merge-tree-parser";

/**
 * Calcula el risk score compuesto según la fórmula de la spec §5.1.
 * risk_score = (age_days × 0.4) + (file_count_normalized × 0.3) + (zone_weight × 0.3)
 *
 * @param ageDays - Días desde la detección del conflicto
 * @param fileCount - Número de archivos en conflicto
 * @param maxFileCount - Máximo número de archivos entre todos los PRs (para normalización)
 * @param zoneScore - Peso de la zona más caliente afectada (0–1)
 * @returns Risk score (0–100)
 */
export function computeRiskScore(
  ageDays: number,
  fileCount: number,
  maxFileCount: number,
  zoneScore: number,
): number {
  const fileNorm = (fileCount / Math.max(maxFileCount, 1)) * 100;
  const zoneWeight = zoneScore * 100;
  return Math.min(
    100,
    Math.round(ageDays * 0.4 + fileNorm * 0.3 + zoneWeight * 0.3),
  );
}

describe("computeRiskScore", () => {
  it("risk score bajo para conflicto reciente + pocos archivos", () => {
    // Conflicto de 1 día, 1 archivo, zona con score bajo
    const score = computeRiskScore(1, 1, 10, 0.1);
    // 1*0.4 + (1/10*100)*0.3 + (0.1*100)*0.3 = 0.4 + 3 + 3 = 6.4 → 6
    expect(score).toBeLessThanOrEqual(25);
    expect(classifyRisk(score)).toBe("low");
  });

  it("risk score alto para conflicto viejo + muchos archivos", () => {
    // Conflicto de 30 días, 10 archivos (max), zona con score alto
    const score = computeRiskScore(30, 10, 10, 0.9);
    // 30*0.4 + (10/10*100)*0.3 + (0.9*100)*0.3 = 12 + 30 + 27 = 69
    expect(score).toBeGreaterThanOrEqual(51);
    expect(classifyRisk(score)).toBe("high");
  });

  it("risk score critical para conflicto muy viejo + muchos archivos + zona caliente", () => {
    // Conflicto de 50 días, 10 archivos, zona con score máximo
    const score = computeRiskScore(50, 10, 10, 1.0);
    // 50*0.4 + 100*0.3 + 100*0.3 = 20 + 30 + 30 = 80
    expect(score).toBeGreaterThanOrEqual(76);
    expect(classifyRisk(score)).toBe("critical");
  });

  it("score se capa en 100", () => {
    const score = computeRiskScore(200, 50, 10, 1.0);
    expect(score).toBe(100);
  });

  it("score 0 para todo en cero", () => {
    const score = computeRiskScore(0, 0, 10, 0);
    expect(score).toBe(0);
  });
});

describe("riskLevel classification", () => {
  it("low: score < 26", () => {
    expect(classifyRisk(10)).toBe("low");
    expect(classifyRisk(25)).toBe("low");
  });

  it("medium: 26-50", () => {
    expect(classifyRisk(26)).toBe("medium");
    expect(classifyRisk(50)).toBe("medium");
  });

  it("high: 51-75", () => {
    expect(classifyRisk(51)).toBe("high");
    expect(classifyRisk(75)).toBe("high");
  });

  it("critical: 76-100", () => {
    expect(classifyRisk(76)).toBe("critical");
    expect(classifyRisk(100)).toBe("critical");
  });
});
