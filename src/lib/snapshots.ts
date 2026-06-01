import fs from "node:fs";
import { z } from "zod";

import type {
  Drift,
  GithubSnapshot,
  IssueCurrent,
  PrCurrent,
  RawCounts,
  StateSnapshot,
} from "@/lib/types";

// Validación tolerante (SPEC §9.5: degradar con elegancia ante campos vacíos).
// Cada campo trae default/catch para no crashear si el runtime emite algo parcial.

const Num = z.coerce.number().catch(0);
const Str = z.coerce.string().catch("");

const CiSchema = z
  .object({
    state: Str.default("none"),
    passed: Num,
    failed: Num,
    pending: Num,
  })
  .catch({ state: "none", passed: 0, failed: 0, pending: 0 });

const MetaSchema = z
  .object({
    reviewDecision: Str.default(""),
    mergeable: Str.default("UNKNOWN"),
    isDraft: z.boolean().catch(false),
    ci: CiSchema.default({ state: "none", passed: 0, failed: 0, pending: 0 }),
    ahead: Num,
    behind: Num,
    status: Str.default(""),
    labels: z.array(Str).catch([]),
    assignee: Str.optional(),
    milestone: Str.optional(),
  })
  .partial()
  .catch({});

const ItemSchema = z.object({
  id: Str.default(""),
  kind: Str.default(""),
  title: Str.default(""),
  url: Str.default(""),
  state: Str.default(""),
  actor: Str.default(""),
  ts: Str.default(""),
  meta: MetaSchema.default({}),
});

const RawSchema = z
  .object({
    pr_open: Num,
    pr_merged: Num,
    pr_closed: Num,
    pr_ci_failing: Num,
    issues: Num,
    mentions: Num,
    subscriptions: Num,
    notifs_total: Num,
  })
  .partial()
  .catch({});

const GithubFileSchema = z.object({
  fetched_at: Str.default(""),
  ok: z.boolean().catch(true),
  summary: Str.default(""),
  raw: RawSchema,
  items: z.array(ItemSchema).catch([]),
});

const StateFileSchema = z.object({
  deltas: z.array(Str).catch([]),
  critical: z.array(Str).catch([]),
  updated_at: Str.default(""),
});

/** Normaliza valores opcionales de string a `string | null` (la coerción de Zod puede
 *  dejar el literal "undefined" cuando el campo no viene en el snapshot). */
function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v !== "" && v !== "undefined" ? v : null;
}

function readJson(path: string | undefined): unknown | null {
  if (!path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function toRawCounts(raw: z.infer<typeof RawSchema>): RawCounts {
  return {
    prOpen: raw.pr_open ?? 0,
    prMerged: raw.pr_merged ?? 0,
    prClosed: raw.pr_closed ?? 0,
    prCiFailing: raw.pr_ci_failing ?? 0,
    issues: raw.issues ?? 0,
    mentions: raw.mentions ?? 0,
    subscriptions: raw.subscriptions ?? 0,
    notifsTotal: raw.notifs_total ?? 0,
  };
}

/** Lee y normaliza github.json (estado actual). `null` si no se pudo leer/parsear. */
export function readGithubSnapshot(): GithubSnapshot | null {
  const data = readJson(process.env.GITHUB_SNAPSHOT);
  if (data === null) return null;
  const parsed = GithubFileSchema.safeParse(data);
  if (!parsed.success) return null;
  const gh = parsed.data;

  const prs: PrCurrent[] = [];
  const issues: IssueCurrent[] = [];
  let drift: Drift | null = null;
  let release: string | null = null;

  for (const it of gh.items) {
    const n = Number.parseInt(it.id, 10);
    const meta = it.meta ?? {};
    if (it.kind === "pr" && Number.isFinite(n)) {
      const ci = meta.ci ?? { state: "none", passed: 0, failed: 0, pending: 0 };
      const actor = cleanStr(it.actor);
      prs.push({
        number: n,
        title: it.title,
        url: it.url,
        state: it.state,
        author: actor,
        reviewDecision: meta.reviewDecision ?? "",
        mergeable: meta.mergeable ?? "UNKNOWN",
        isDraft: meta.isDraft ?? false,
        ci: {
          state: (ci.state as PrCurrent["ci"]["state"]) ?? "none",
          passed: ci.passed ?? 0,
          failed: ci.failed ?? 0,
          pending: ci.pending ?? 0,
        },
        updatedAt: it.ts,
      });
    } else if (it.kind === "issue" && Number.isFinite(n)) {
      issues.push({
        number: n,
        title: it.title,
        url: it.url,
        state: it.state,
        labels: meta.labels ?? [],
        assignee: cleanStr(meta.assignee),
        milestone: cleanStr(meta.milestone),
        updatedAt: it.ts,
      });
    } else if (it.kind === "drift") {
      drift = {
        ahead: meta.ahead ?? 0,
        behind: meta.behind ?? 0,
        status: meta.status ?? "",
      };
    } else if (it.kind === "release" && !release) {
      release = it.id || null;
    }
  }

  return {
    fetchedAt: gh.fetched_at,
    ok: gh.ok,
    summary: gh.summary,
    raw: toRawCounts(gh.raw),
    prs,
    issues,
    drift,
    release,
  };
}

/** Lee state.json (feed de novedades). `null` si no se pudo leer/parsear. */
export function readStateSnapshot(): StateSnapshot | null {
  const data = readJson(process.env.STATE_JSON);
  if (data === null) return null;
  const parsed = StateFileSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    deltas: parsed.data.deltas,
    critical: parsed.data.critical,
    updatedAt: parsed.data.updated_at,
  };
}

/** Lectura ligera para /api/health: solo fetched_at + ok (sin mapear items). */
export function readGithubHealth(): {
  ok: boolean;
  fetchedAt: string | null;
} | null {
  const data = readJson(process.env.GITHUB_SNAPSHOT);
  if (data === null) return null;
  const parsed = z
    .object({ fetched_at: Str.default(""), ok: z.boolean().catch(true) })
    .safeParse(data);
  if (!parsed.success) return null;
  return { ok: parsed.data.ok, fetchedAt: parsed.data.fetched_at || null };
}

// --- Discord snapshot ---

const DiscordItemSchema = z.object({
  ts: Str.default(""),
  user: Str.default(""),
  channel: Str.default(""),
  msg_type: Str.default("message"),
  detail: Str.default(""),
});

const DiscordFileSchema = z.object({
  fetched_at: Str.default(""),
  ok: z.boolean().catch(true),
  summary: Str.default(""),
  items: z.array(DiscordItemSchema).catch([]),
});

export interface DiscordSnapshot {
  fetchedAt: string;
  ok: boolean;
  summary: string;
  items: Array<{
    ts: string;
    user: string;
    channel: string;
    msgType: string;
    detail: string;
  }>;
}

/** Lee discord.json (actividad Discord). `null` si no existe/parsea. */
export function readDiscordSnapshot(): DiscordSnapshot | null {
  const data = readJson(process.env.DISCORD_SNAPSHOT);
  if (data === null) return null;
  const parsed = DiscordFileSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    fetchedAt: parsed.data.fetched_at,
    ok: parsed.data.ok,
    summary: parsed.data.summary,
    items: parsed.data.items.map((it) => ({
      ts: it.ts,
      user: it.user,
      channel: it.channel,
      msgType: it.msg_type,
      detail: it.detail,
    })),
  };
}
