import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";
import type { IssuesResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withMetrics(async () => {
  const repos = makeRepos();
  const gh = await repos.snapshot.readGithub();
  const body: IssuesResponse = {
    ok: gh !== null,
    fetchedAt: gh?.fetchedAt ?? null,
    issues: gh?.issues ?? [],
  };
  return NextResponse.json(body);
});
