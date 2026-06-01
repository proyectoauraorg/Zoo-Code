import path from "node:path";

import { describe, expect, it } from "vitest";

import { readGithubSnapshot } from "@/lib/snapshots";

const FIXTURE = path.resolve(
  process.cwd(),
  "src/lib/__tests__/github.sample.json",
);

describe("readGithubSnapshot", () => {
  it("parsea raw/PRs/issues/drift/release del snapshot", () => {
    process.env.GITHUB_SNAPSHOT = FIXTURE;
    const gh = readGithubSnapshot();
    expect(gh).not.toBeNull();
    if (!gh) return;

    expect(gh.fetchedAt).toBe("2026-05-20T12:00:00Z");
    expect(gh.raw.prOpen).toBe(2);
    expect(gh.raw.notifsTotal).toBe(7);

    expect(gh.prs).toHaveLength(2);
    const pr100 = gh.prs.find((p) => p.number === 100);
    expect(pr100?.mergeable).toBe("CONFLICTING");
    expect(pr100?.ci.state).toBe("fail");
    expect(pr100?.ci.failed).toBe(2);

    expect(gh.drift).toEqual({ ahead: 4, behind: 1, status: "diverged" });
    expect(gh.release).toBe("v9.9.9");
  });

  it("degrada con elegancia: issue con meta vacío → labels [] y assignee null", () => {
    process.env.GITHUB_SNAPSHOT = FIXTURE;
    const gh = readGithubSnapshot();
    expect(gh?.issues).toHaveLength(1);
    const issue = gh?.issues[0];
    expect(issue?.number).toBe(200);
    expect(issue?.labels).toEqual([]);
    expect(issue?.assignee).toBeNull();
    expect(issue?.milestone).toBeNull();
  });

  it("devuelve null si el archivo no existe", () => {
    process.env.GITHUB_SNAPSHOT = "/no/existe/github.json";
    expect(readGithubSnapshot()).toBeNull();
  });
});
