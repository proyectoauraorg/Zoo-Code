# Zoo Code — Upstream Contribution Campaign Playbook

## Strategic Objective

Transform this fork into a **synchronized staging integration branch** aligned continuously with upstream, oriented to close real issues from the original project.

---

## Branch Naming Convention (OBLIGATORY)

| Type     | Prefix      | Example                         |
| -------- | ----------- | ------------------------------- |
| Fix      | `fix/`      | `fix/193-diagnostic-prefix`     |
| Feature  | `feat/`     | `feat/user-agent-migration`     |
| Refactor | `refactor/` | `refactor/62-remove-stale-mcps` |
| Docs     | `docs/`     | `docs/update-user-guide`        |
| Test     | `test/`     | `test/coverage-marketplace`     |
| Chore    | `chore/`    | `chore/update-deps`             |

**Critical rule**: `TYPE/ISSUE-NUMBER-brief-description`

---

## Core Rules

1. **ONE ISSUE = ONE BRANCH = ONE PR** — Never mix.
2. **Never commit directly to main.**
3. **Always rebase on upstream/main before opening PR.**
4. **Always validate**: typecheck, lint, tests, build, coverage.
5. **Semantic commits**: `fix:`, `feat:`, `refactor:`, `docs:`, `test:`, `chore:`

---

## Social Rules for Maintainers

### DO:

- Small, focused PRs
- Semantic commits
- Clear descriptions
- Link upstream issues
- Screenshots for UI changes
- Include tests

### DON'T:

- Mega PRs
- Ideological changes
- Mass reformats
- Global renames
- Drive-by changes
- Unnecessary force pushes

---

## PR Validation Checklist (MANDATORY before submission)

### Technical Validation

| Validation   | Required |
| ------------ | -------- |
| Typecheck    | ✅       |
| Lint         | ✅       |
| Tests        | ✅       |
| Coverage     | ≥95%     |
| Build        | ✅       |
| Clean rebase | ✅       |
| Conflicts    | 0        |

### Pre-Submission Intelligence

| Check                                    | Required                           |
| ---------------------------------------- | ---------------------------------- |
| Existing PRs on same issue?              | ✅ Cross-reference in body         |
| Title indicates specific file/component? | ✅ Narrow scope                    |
| Body lists exact changed files?          | ✅ Use "Changes (N files):" format |
| No heredoc in `gh pr create`?            | ✅ Use `--body-file` instead       |

---

## PR Package Format (for every submission)

Every PR must include:

- **Branch name**
- **Linked upstream issue/PR**
- **Technical summary**
- **Non-technical summary**
- **Risk level** (Low/Medium/High)
- **Affected files**
- **Tests added**
- **Coverage impact**
- **Merge readiness**
- **Rollback strategy**
- **Maintainer-facing PR description in English**

---

## Fork Directory Structure

```
Zoo-Code-contrib/
├── upstream-sync/      # Sync scripts and state tracking
├── worktrees/          # Temporary worktrees for parallel work
├── patches/            # Patch files for backup/review
├── issue-research/     # Issue analysis documents
├── ci-analysis/        # CI failure analysis
├── abandoned-prs/      # Forensic snapshots of abandoned PRs
├── prompts/            # Agent prompt templates
├── docs/               # Internal documentation
└── automation/         # Automation scripts
```

---

## Contribution Pipeline Architecture

```
Upstream (Zoo-Code-Org)
    ↓
Mirror Sync (main ↔ upstream/main)
    ↓
Issue Intelligence (classify P0-P4)
    ↓
Branch Isolation (one issue = one branch)
    ↓
Validation Layer (typecheck, lint, tests, build, coverage)
    ↓
PR Hardening (clean rebase, conflict resolution)
    ↓
Maintainer Delivery (official PR upstream)
```

---

## Priority Classification

| Priority | Type              | Action        |
| -------- | ----------------- | ------------- |
| P0       | CI broken         | Immediate     |
| P1       | Reproducible bugs | High priority |
| P2       | Safe refactors    | Medium        |
| P3       | DX / docs         | Normal        |
| P4       | Complex features  | Plan first    |

---

## Current State

- **Sync status**: main === upstream/main ✅
- **Active PR**: #16 (fix/193-diagnostic-prefix-v2) — Pending upstream submission
- **Fork PRs**: #15 (rebrand remnants, broad), #16 (diagnostic prefix, narrow)
- **Lesson applied**: PR #194 closed as duplicate → re-submitted as PR #16 with narrow scope
- **Next action**: Submit PR #16 upstream; evaluate PR #15 scope reduction

---

_Last updated: 2026-05-19T20:35 CDT_
