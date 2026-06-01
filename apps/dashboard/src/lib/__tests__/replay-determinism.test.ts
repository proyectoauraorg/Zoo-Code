// Replay Determinism Contract — Tests (V2.h)
// Verifica las invariantes del REPLAY_DETERMINISM_CONTRACT.md sin DB real.
// Solo funciones puras y verificación de tipos/estructuras.

import { describe, expect, it } from "vitest";
import { globalOrder } from "@/lib/replay/engine";
import type { ReplayOptions, ReplayResult } from "@/lib/replay/engine";
import type { ParityResult, ParityDiff } from "@/lib/replay/parity-checker";
import type { DecisionRecord } from "@/lib/alerting/decision-log";

// ── Helpers ──

interface OrderableEvent {
  ts: string;
  aggregate_version: number;
  event_id: string;
}

function makeEvent(
  ts: string,
  aggregate_version: number,
  event_id: string,
): OrderableEvent {
  return { ts, aggregate_version, event_id };
}

// ── 1. globalOrder determinismo ──

describe("Replay Determinism Contract", () => {
  describe("globalOrder: orden determinista y total", () => {
    it("orden consistente entre ejecuciones (misma entrada → mismo resultado)", () => {
      const events: OrderableEvent[] = [
        makeEvent("2026-05-01T00:00:00Z", 2, "evt-c"),
        makeEvent("2026-05-01T00:00:00Z", 1, "evt-b"),
        makeEvent("2026-05-01T00:00:00Z", 3, "evt-a"),
        makeEvent("2026-04-30T23:59:59Z", 1, "evt-d"),
      ];

      // Ejecutar sort múltiples veces y verificar idempotencia
      const results: string[][] = [];
      for (let i = 0; i < 10; i++) {
        const sorted = [...events].sort(globalOrder);
        results.push(sorted.map((e) => e.event_id));
      }

      // Todas las ejecuciones deben dar el mismo orden
      const first = results[0];
      for (const result of results) {
        expect(result).toEqual(first);
      }

      // Verificar orden esperado: ts ASC → aggregate_version ASC → event_id ASC
      expect(first).toEqual(["evt-d", "evt-b", "evt-c", "evt-a"]);
    });

    it("ts tiene prioridad sobre aggregate_version", () => {
      const earlier: OrderableEvent = makeEvent(
        "2026-05-01T00:00:00Z",
        99,
        "evt-early",
      );
      const later: OrderableEvent = makeEvent(
        "2026-05-02T00:00:00Z",
        1,
        "evt-later",
      );

      // ts menor va primero aunque aggregate_version sea mucho mayor
      expect(globalOrder(earlier, later)).toBeLessThan(0);
      expect(globalOrder(later, earlier)).toBeGreaterThan(0);
    });

    it("event_id es tie-break final (mismo ts + aggregate_version)", () => {
      const a: OrderableEvent = makeEvent(
        "2026-05-01T12:00:00Z",
        5,
        "evt-aaa",
      );
      const b: OrderableEvent = makeEvent(
        "2026-05-01T12:00:00Z",
        5,
        "evt-zzz",
      );

      // Orden lexicográfico de event_id
      expect(globalOrder(a, b)).toBeLessThan(0);
      expect(globalOrder(b, a)).toBeGreaterThan(0);
    });

    it("eventos idénticos producen 0 (reflexividad)", () => {
      const ev = makeEvent("2026-05-01T00:00:00Z", 1, "evt-same");
      expect(globalOrder(ev, ev)).toBe(0);
    });

    it("sort produce orden total (antisimétrico + transitivo)", () => {
      const events: OrderableEvent[] = [
        makeEvent("2026-05-03T00:00:00Z", 1, "c"),
        makeEvent("2026-05-01T00:00:00Z", 2, "a"),
        makeEvent("2026-05-02T00:00:00Z", 1, "b"),
        makeEvent("2026-05-01T00:00:00Z", 1, "d"),
      ];

      const sorted = [...events].sort(globalOrder);
      const ids = sorted.map((e) => e.event_id);

      // Verificar que cada par consecutivo está en orden correcto
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(globalOrder(sorted[i], sorted[i + 1])).toBeLessThanOrEqual(0);
      }

      // Orden esperado: ts ASC → agg ASC → event_id ASC
      expect(ids).toEqual(["d", "a", "b", "c"]);
    });
  });

  // ── 2. ReplayOptions types ──

  describe("ReplayOptions: contrato de tipos", () => {
    it("intoTarget acepta 'live' y 'shadow'", () => {
      const liveOptions: ReplayOptions = { intoTarget: "live" };
      const shadowOptions: ReplayOptions = { intoTarget: "shadow" };
      const undefinedOptions: ReplayOptions = {};

      expect(liveOptions.intoTarget).toBe("live");
      expect(shadowOptions.intoTarget).toBe("shadow");
      expect(undefinedOptions.intoTarget).toBeUndefined();
    });

    it("ReplayOptions campos opcionales están definidos", () => {
      const fullOptions: ReplayOptions = {
        from: "2026-01-01T00:00:00Z",
        to: "2026-12-31T23:59:59Z",
        only: "conflicts",
        intoTarget: "shadow",
        dryRun: true,
      };

      expect(fullOptions.from).toBe("2026-01-01T00:00:00Z");
      expect(fullOptions.to).toBe("2026-12-31T23:59:59Z");
      expect(fullOptions.only).toBe("conflicts");
      expect(fullOptions.dryRun).toBe(true);
    });

    it("only acepta los valores del spec", () => {
      const validValues: ReplayOptions["only"][] = [
        "all",
        "conflicts",
        "contributors",
        "metrics",
      ];
      for (const val of validValues) {
        const opts: ReplayOptions = { only: val };
        expect(opts.only).toBe(val);
      }
    });
  });

  // ── 3. ReplayResult structure ──

  describe("ReplayResult: estructura del resultado", () => {
    it("tiene los campos requeridos del spec", () => {
      const result: ReplayResult = {
        eventsProcessed: 42,
        decisionsRecorded: 7,
        alertsGenerated: 3,
        durationMs: 150,
        parityCheck: undefined,
      };

      expect(typeof result.eventsProcessed).toBe("number");
      expect(typeof result.decisionsRecorded).toBe("number");
      expect(typeof result.alertsGenerated).toBe("number");
      expect(typeof result.durationMs).toBe("number");
    });

    it("parityCheck es opcional (solo en shadow mode)", () => {
      const withoutParity: ReplayResult = {
        eventsProcessed: 10,
        decisionsRecorded: 0,
        alertsGenerated: 0,
        durationMs: 50,
      };

      expect(withoutParity.parityCheck).toBeUndefined();
    });
  });

  // ── 4. ParityResult structure ──

  describe("ParityResult: tiene structural y semantic levels", () => {
    it("estructura completa con ambos niveles", () => {
      const result: ParityResult = {
        match: true,
        structural: { checked: 100, differences: [] },
        semantic: { checked: 50, differences: [] },
        timestamp: "2026-05-30T00:00:00Z",
      };

      expect(result.match).toBe(true);
      expect(result.structural).toBeDefined();
      expect(result.semantic).toBeDefined();
      expect(typeof result.structural.checked).toBe("number");
      expect(typeof result.semantic.checked).toBe("number");
      expect(Array.isArray(result.structural.differences)).toBe(true);
      expect(Array.isArray(result.semantic.differences)).toBe(true);
      expect(typeof result.timestamp).toBe("string");
    });

    it("ParityDiff tiene los campos correctos", () => {
      const diff: ParityDiff = {
        table: "conflict_lifecycle",
        column: "state",
        entityId: "42:1",
        liveValue: "entered",
        replayValue: "resolved",
        level: "structural",
      };

      expect(diff.table).toBe("conflict_lifecycle");
      expect(diff.column).toBe("state");
      expect(diff.entityId).toBe("42:1");
      expect(["structural", "semantic"]).toContain(diff.level);
    });

    it("match es false cuando hay diferencias", () => {
      const diff: ParityDiff = {
        table: "conflict_lifecycle",
        column: "state",
        entityId: "42:1",
        liveValue: "entered",
        replayValue: "resolved",
        level: "structural",
      };

      const result: ParityResult = {
        match: false,
        structural: { checked: 1, differences: [diff] },
        semantic: { checked: 0, differences: [] },
        timestamp: "2026-05-30T00:00:00Z",
      };

      expect(result.match).toBe(false);
      expect(result.structural.differences).toHaveLength(1);
    });
  });

  // ── 5. DecisionRecord contract ──

  describe("DecisionRecord: todos los campos requeridos", () => {
    it("tiene los campos del spec con tipos correctos", () => {
      const record: DecisionRecord = {
        ruleId: "conflict_duration",
        evaluatedAt: "2026-05-30T00:00:00Z",
        entityKind: "pr",
        entityRef: "42",
        stateSnapshot: { title: "Fix bug", detected_at: "2026-05-29T00:00:00Z" },
        pressureSnapshot: null,
        threshold: { seconds: 3600 },
        triggered: true,
        alertId: 123,
        dedupeKey: "conflict_duration:42",
        message: "⚠️ PR #42 en conflicto hace 60min",
      };

      expect(typeof record.ruleId).toBe("string");
      expect(typeof record.evaluatedAt).toBe("string");
      expect(record.entityKind === null || typeof record.entityKind === "string").toBe(true);
      expect(record.entityRef === null || typeof record.entityRef === "string").toBe(true);
      expect(typeof record.stateSnapshot).toBe("object");
      expect(typeof record.threshold).toBe("object");
      expect(typeof record.triggered).toBe("boolean");
      expect(record.alertId === null || typeof record.alertId === "number").toBe(true);
      expect(record.dedupeKey === null || typeof record.dedupeKey === "string").toBe(true);
      expect(record.message === null || typeof record.message === "string").toBe(true);
    });

    it("acepta null en campos opcionales", () => {
      const record: DecisionRecord = {
        ruleId: "conflict_pressure",
        evaluatedAt: "2026-05-30T00:00:00Z",
        entityKind: null,
        entityRef: null,
        stateSnapshot: {},
        pressureSnapshot: null,
        threshold: { pressure: 8.0 },
        triggered: false,
        alertId: null,
        dedupeKey: null,
        message: null,
      };

      expect(record.entityKind).toBeNull();
      expect(record.entityRef).toBeNull();
      expect(record.pressureSnapshot).toBeNull();
      expect(record.alertId).toBeNull();
      expect(record.dedupeKey).toBeNull();
      expect(record.message).toBeNull();
    });
  });
});
