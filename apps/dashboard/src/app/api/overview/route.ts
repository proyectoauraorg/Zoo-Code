import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";
import type { OverviewResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withMetrics(async () => {
  const repos = makeRepos();
  const [gh, state, mergedThisWeek, series, recentEvents] = await Promise.all([
    repos.snapshot.readGithub(),
    repos.snapshot.readState(),
    repos.metric.getMergedThisWeek(),
    repos.metric.getMetricSeries(30),
    repos.event.getRecentEvents(20),
  ]);

  const body: OverviewResponse = {
    ok: gh !== null,
    stale: gh === null,
    fetchedAt: gh?.fetchedAt ?? null,
    raw: gh?.raw ?? null,
    drift: gh?.drift ?? null,
    release: gh?.release ?? null,
    mergedThisWeek,
    series,
    feed: state?.deltas ?? [],
    recentEvents,
  };
  return NextResponse.json(body);
});
