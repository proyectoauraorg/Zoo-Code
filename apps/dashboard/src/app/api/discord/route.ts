import { NextResponse } from "next/server";

import { makeRepos } from "@/lib/repo";
import { withMetrics } from "@/lib/api-middleware";
import type { DiscordResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FRESH_THRESHOLD_S = 48 * 3600; // 48 horas

export const GET = withMetrics(async () => {
  const repos = makeRepos();
  const [dc, totalMessages, byChannel, byUser, rawSeries, lastActivity] = await Promise.all([
    repos.snapshot.readDiscord(),
    repos.discord.getTotal(),
    repos.discord.getByChannel(10),
    repos.discord.getByUser(10),
    repos.discord.getSeries(30),
    repos.discord.getLastActivity(),
  ]);

  const lastIntake = lastActivity ?? dc?.fetchedAt ?? null;
  const fresh = lastIntake !== null
    ? (Date.now() - Date.parse(lastIntake)) / 1000 < FRESH_THRESHOLD_S
    : false;

  const body: DiscordResponse = {
    ok: dc?.ok ?? totalMessages > 0,
    fresh,
    lastIntake,
    totalMessages,
    byChannel,
    byUser,
    series: rawSeries,
  };
  return NextResponse.json(body);
});
