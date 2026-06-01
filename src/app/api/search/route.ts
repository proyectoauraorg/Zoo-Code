import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";
import type { SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/search?q=foo&limit=20
 *
 * Busca PRs, issues y (futuro) contributors en el snapshot vivo.
 */
export const GET = withMetrics(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);

  const repos = makeRepos();
  const body: SearchResponse = await repos.snapshot.search(q, limit);
  return NextResponse.json(body);
});
