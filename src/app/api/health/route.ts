import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Endpoint barato para el header operacional: salud del snapshot. */
export const GET = withMetrics(async () => {
  const repos = makeRepos();
  const body = await repos.health.getHealth();
  return NextResponse.json(body);
});
