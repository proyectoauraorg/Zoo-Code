import { NextResponse } from "next/server";

import { buildSystemHealth } from "@/lib/system-health";
import { withMetrics } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Endpoint de System Health — compone señales de salud del propio ZooDash. */
export const GET = withMetrics(async () => {
  const body = buildSystemHealth();
  return NextResponse.json(body);
});
