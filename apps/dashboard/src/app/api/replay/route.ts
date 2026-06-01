import { NextResponse } from "next/server";

import { getDbWritable } from "@/lib/db";
import { executeReplay } from "@/lib/replay/engine";
import { withMetrics } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/replay — Ejecuta replay en shadow mode + parity check.
 * GET  /api/replay/status — Info básica del event_log (count, último evento).
 */
export const POST = withMetrics(async () => {
  try {
    const result = executeReplay({ intoTarget: "shadow" });
    return NextResponse.json({
      ok: true,
      ...result,
      parityMatch: result.parityCheck?.match ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});

export const GET = withMetrics(async () => {
  const db = getDbWritable();
  if (!db) {
    return NextResponse.json({
      ok: false,
      error: "Database not available",
      eventCount: 0,
      lastEvent: null,
    });
  }

  try {
    const countRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM event_log")
      .get() as { cnt: number };

    const lastEvent = db
      .prepare(
        `SELECT event_id, type, ts, entity_kind, entity_ref
         FROM event_log
         ORDER BY ts DESC, id DESC
         LIMIT 1`,
      )
      .get() as {
      event_id: string;
      type: string;
      ts: string;
      entity_kind: string;
      entity_ref: string;
    } | undefined;

    const decisionCount = (() => {
      try {
        const row = db
          .prepare("SELECT COUNT(*) AS cnt FROM decision_log")
          .get() as { cnt: number };
        return row.cnt;
      } catch {
        return 0;
      }
    })();

    return NextResponse.json({
      ok: true,
      eventCount: countRow.cnt,
      decisionCount,
      lastEvent: lastEvent ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});
