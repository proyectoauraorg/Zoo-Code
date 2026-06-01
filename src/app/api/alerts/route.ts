import { NextResponse } from "next/server";

import { evaluateAlertRules, getAllAlerts, resolveAlert } from "@/lib/alerting/engine";
import { withMetrics } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/alerts — devuelve alertas y evalúa reglas. */
export const GET = withMetrics(async () => {
  const newAlerts = evaluateAlertRules();
  const alerts = getAllAlerts(50);
  return NextResponse.json({
    ok: true,
    alerts,
    newCount: newAlerts.length,
  });
});

/** POST /api/alerts — resolver una alerta { id: number }. */
export const POST = withMetrics(async (request: Request) => {
  try {
    const body = await request.json();
    const id = Number(body?.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
    }
    const resolved = resolveAlert(id);
    return NextResponse.json({ ok: resolved });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
});
