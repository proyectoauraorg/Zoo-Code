import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";
import type { PrsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withMetrics(async () => {
  const repos = makeRepos();
  const gh = await repos.snapshot.readGithub();
  const { columns, prs } = await repos.pr.getKanbanData();

  const body: PrsResponse = {
    ok: gh !== null,
    fetchedAt: gh?.fetchedAt ?? null,
    columns,
    prs,
  };
  return NextResponse.json(body);
});
