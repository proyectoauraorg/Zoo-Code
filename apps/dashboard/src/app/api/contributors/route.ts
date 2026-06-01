import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";
import type { ContributorsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withMetrics(async () => {
  const repos = makeRepos();
  const [gh, contributors, busFactor] = await Promise.all([
    repos.snapshot.readGithub(),
    repos.contributor.getContributors(),
    repos.contributor.getBusFactor(),
  ]);

  const body: ContributorsResponse = {
    ok: gh !== null,
    total: contributors.length,
    busFactor,
    contributors,
  };
  return NextResponse.json(body);
});
