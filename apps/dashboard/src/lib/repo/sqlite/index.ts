// SQLite Repository — envuelve las funciones síncronas existentes en Promises.
// Implementación de Repos sobre el driver SQLite actual (better-sqlite3).

import {
  getBusFactor,
  getContributors,
  getCycleTimes,
  getDiscordByChannel,
  getDiscordByUser,
  getDiscordLastActivity,
  getDiscordSeries,
  getDiscordTotal,
  getMergedThisWeek,
  getMetricSeries,
  getOpenPrsByAuthor,
  getRecentEvents,
} from "@/lib/queries";
import {
  readDiscordSnapshot,
  readGithubHealth,
  readGithubSnapshot,
  readStateSnapshot,
} from "@/lib/snapshots";
import type { Repos } from "@/lib/repo/types";
import { daysSince, getColumnEntryTimes } from "@/lib/queries";
import { kanbanColumn, KANBAN_COLUMNS } from "@/lib/kanban";

export function makeSqliteRepos(): Repos {
  return {
    metric: {
      async getMetricSeries(days) {
        return getMetricSeries(days);
      },
      async getMergedThisWeek() {
        return getMergedThisWeek();
      },
    },

    pr: {
      async getColumnEntryTimes() {
        return getColumnEntryTimes();
      },
      async getKanbanData() {
        const gh = readGithubSnapshot();
        const entry = getColumnEntryTimes();
        const prs = [];
        for (const pr of gh?.prs ?? []) {
          const column = kanbanColumn(pr.state, pr.reviewDecision, pr.isDraft);
          if (!column) continue;
          const entryTs = entry.get(pr.number);
          prs.push({
            ...pr,
            column,
            agingDays: entryTs ? daysSince(entryTs) : daysSince(pr.updatedAt),
          });
        }
        return { columns: KANBAN_COLUMNS, prs };
      },
    },

    event: {
      async getRecentEvents(limit) {
        return getRecentEvents(limit);
      },
    },

    contributor: {
      async getContributors() {
        const contributors = getContributors();
        const openByAuthor = getOpenPrsByAuthor();
        const gh = readGithubSnapshot();
        const cycleTimes = getCycleTimes();
        const cycleByLogin = new Map<string, number[]>();
        for (const ct of cycleTimes) {
          const arr = cycleByLogin.get(ct.login);
          if (arr) arr.push(ct.cycle_hours);
          else cycleByLogin.set(ct.login, [ct.cycle_hours]);
        }
        const snapshotAuthors = new Set<string>();
        if (gh) {
          for (const pr of gh.prs) {
            if (pr.author) snapshotAuthors.add(pr.author);
          }
        }
        const stats = [];
        const seenLogins = new Set<string>();
        for (const c of contributors) {
          seenLogins.add(c.login);
          const open = openByAuthor.get(c.login);
          const snapshotOpenCount = gh?.prs.filter((p) => p.author === c.login && p.state === "OPEN").length ?? 0;
          const ctValues = cycleByLogin.get(c.login);
          const ct = ctValues ? percentiles(ctValues) : null;
          stats.push({
            login: c.login,
            prsOpened: c.prs_opened,
            prsMerged: c.prs_merged,
            prsClosed: c.prs_closed,
            prsOpen: open?.count ?? snapshotOpenCount,
            ciFailing: open?.ciFailing ?? 0,
            conflicts: open?.conflicts ?? 0,
            cycleP50H: ct?.p50 ?? null,
            cycleP90H: ct?.p90 ?? null,
            firstSeen: c.first_seen,
            lastSeen: c.last_seen,
          });
        }
        for (const login of snapshotAuthors) {
          if (seenLogins.has(login)) continue;
          const open = openByAuthor.get(login);
          const snapshotPrs = gh?.prs.filter((p) => p.author === login) ?? [];
          const openCount = snapshotPrs.filter((p) => p.state === "OPEN").length;
          const mergedCount = snapshotPrs.filter((p) => p.state === "MERGED").length;
          const closedCount = snapshotPrs.filter((p) => p.state === "CLOSED").length;
          stats.push({
            login,
            prsOpened: openCount + mergedCount + closedCount,
            prsMerged: mergedCount,
            prsClosed: closedCount,
            prsOpen: open?.count ?? openCount,
            ciFailing: open?.ciFailing ?? 0,
            conflicts: open?.conflicts ?? 0,
            cycleP50H: null,
            cycleP90H: null,
            firstSeen: gh?.fetchedAt ?? "",
            lastSeen: gh?.fetchedAt ?? "",
          });
        }
        stats.sort((a, b) => {
          const aScore = a.prsOpen * 3 + a.prsMerged;
          const bScore = b.prsOpen * 3 + b.prsMerged;
          return bScore - aScore;
        });
        return stats;
      },
      async getOpenPrsByAuthor() {
        return getOpenPrsByAuthor();
      },
      async getCycleTimes() {
        return getCycleTimes();
      },
      async getBusFactor() {
        return getBusFactor();
      },
    },

    discord: {
      async getByChannel(limit) {
        return getDiscordByChannel(limit);
      },
      async getByUser(limit) {
        return getDiscordByUser(limit);
      },
      async getSeries(days) {
        return getDiscordSeries(days).map((r) => ({ date: r.d, count: r.count }));
      },
      async getLastActivity() {
        return getDiscordLastActivity();
      },
      async getTotal() {
        return getDiscordTotal();
      },
    },

    snapshot: {
      async readGithub() {
        return readGithubSnapshot();
      },
      async readState() {
        return readStateSnapshot();
      },
      async readGithubHealth() {
        return readGithubHealth();
      },
      async readDiscord() {
        return readDiscordSnapshot();
      },
      async search(q, limit) {
        const gh = readGithubSnapshot();
        if (!gh) {
          return { ok: false, prs: [], issues: [], contributors: [] };
        }
        const query = q.toLowerCase();
        const isNumberQuery = /^#?\d+$/.test(q);
        const numberQuery = q.replace(/^#/, "");
        const matchesPr = (title: string, number: number): boolean => {
          if (!q) return true;
          if (isNumberQuery && String(number) === numberQuery) return true;
          return title.toLowerCase().includes(query);
        };
        const prs = gh.prs.filter((pr) => matchesPr(pr.title, pr.number)).slice(0, limit).map((pr) => ({ number: pr.number, title: pr.title, state: pr.state, url: pr.url }));
        const issues = gh.issues.filter((iss) => matchesPr(iss.title, iss.number)).slice(0, limit).map((iss) => ({ number: iss.number, title: iss.title, state: iss.state, url: iss.url }));
        return { ok: true, prs, issues, contributors: [] };
      },
    },

    health: {
      async getHealth() {
        const h = readGithubHealth();
        const parsed = h?.fetchedAt && !Number.isNaN(Date.parse(h.fetchedAt)) ? Date.parse(h.fetchedAt) : null;
        const ageSeconds = parsed !== null ? Math.max(0, Math.floor((Date.now() - parsed) / 1000)) : null;
        const stale = h === null || !h.ok || (ageSeconds !== null && ageSeconds > 900);
        return {
          ok: h !== null,
          fetchedAt: h?.fetchedAt ?? null,
          ageSeconds,
          stale,
        };
      },
    },
  };
}

// Helper local: percentiles
function percentiles(values: number[]): { p50: number; p90: number } {
  if (values.length === 0) return { p50: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p90Idx = Math.floor(sorted.length * 0.9);
  return {
    p50: Math.round(sorted[p50Idx] * 10) / 10,
    p90: Math.round(sorted[p90Idx] * 10) / 10,
  };
}
