# Zoo Code — Upstream Backlog Index

> Last updated: 2026-05-19T19:20 CST (UTC-6)
> Source: `gh issue list --repo Zoo-Code-Org/Zoo-Code --state open --limit 100`
> Total open issues indexed: **56**
> Total open PRs indexed: **20** (from `gh pr list --state open`)

---

## Priority Classification Legend

| Priority | Meaning | Criteria |
|----------|---------|----------|
| **P0 — Critical** | Blocks users, data loss, or security | Unassigned bug, no active PR, multiple user reports |
| **P1 — High** | Significant functionality broken or missing | Unassigned bug with clear repro, or enhancement with strong demand |
| **P2 — Medium** | Quality-of-life improvement, moderate demand | Enhancement or bug with workaround available |
| **P3 — Low** | Nice-to-have, low urgency | Cosmetic, opinionated, or edge-case issues |
| **P4 — Icebox** | Long-term / needs upstream coordination | Depends on upstream changes, architectural, or speculative |

---

## Part A: Open Issues (by priority)

### P0 — Critical (0)

_No P0 issues identified at this time._

---

### P1 — High (8)

| # | Title | Labels | Status | Notes |
|---|-------|--------|--------|-------|
| 190 | [BUG] anthropic `tool_use` blocks missing `tool_result` blocks — Complete system failure | bug | Unassigned | Anthropic API broken — affects all Anthropic users |
| 192 | [BUG] The UI often disappears while I'm using it | bug | Unassigned | Linked to PR #153 (potential fix exists) |
| 201 | [BUG] DeepSeek error: 'reasoning_content' must be passed back to the API | bug | Unassigned | Duplicate of upstream anomalyco/opencode#24104 |
| 188 | [BUG] revert does not work at all | bug | Unassigned | Core feature broken — revert is non-functional |
| 186 | [BUG] Grok 4.3 "Unable to apply diff" — Expected '=======' was not found | bug | Unassigned | Diff parsing broken for specific model |
| 169 | [BUG] vscode out-of-workspace read protection trivially circumvented by symlinks | bug | Unassigned | Security vulnerability — symlink escape |
| 204 | [BUG] Support for multi-root workspaces | bug | Unassigned | Multi-root workspace support broken |
| 187 | Context percentage bar shows inconsistent values (dual token counting) | bug | Unassigned | UX confusion from two counting mechanisms |

---

### P2 — Medium (15)

| # | Title | Labels | Status | Notes |
|---|-------|--------|--------|-------|
| 193 | [BUG] Diagnostic temp file still uses `roo-diagnostics-` prefix | bug | Unassigned | Branding miss — partial rebrand leftover |
| 154 | [BUG] Markdown unintentional strikethrough | bug | Unassigned | Markdown rendering issue |
| 152 | [BUG] Agent details hidden when asking a question | bug | Unassigned | UX: requires extra prompt to reveal details |
| 165 | [BUG] Vertex AI: missing eu/us multi-region endpoints in region dropdown | bug | Unassigned | Draft PR #170 exists by roomote |
| 82 | [BUG] System prompt says cmd.exe but powershell is used | bug | Unassigned | Windows shell detection issue |
| 203 | Outdated user-agent string | enhancement | Unassigned | Simple fix, low risk |
| 171 | Adding auto-completion using Ollama models (Gemma 4 e4b) | enhancement | Unassigned | Feature request for local model autocomplete |
| 164 | [ENHANCEMENT] Drag and drop of images | enhancement | @kyr0 claimed (EOW) | Claimed but not yet assigned |
| 157 | [ENHANCEMENT] Adjust font size in Zoo Code extension | enhancement | Unassigned | Multiple CSS workarounds discussed in comments |
| 145 | [ENHANCEMENT] Add AI commit message generation | enhancement | Unassigned | Feature enhancement |
| 122 | Global configuration file support (~/.config/zoo/zoo.jsonc) | enhancement | Unassigned | Config management improvement |
| 120 | [ENHANCEMENT] Show progress for inline code editing | enhancement | Unassigned | UX improvement |
| 105 | [ENHANCEMENT] Tighten Task.ask sequencing for auto-approved asks | enhancement | Unassigned | Interaction flow improvement |
| 102 | [ENHANCEMENT] Reduce approval-control flash for auto-approved asks | enhancement | Unassigned | UX polish |
| 76 | Override Global System Prompts | enhancement | Unassigned | Customization feature |

---

### P3 — Low (18)

| # | Title | Labels | Status | Notes |
|---|-------|--------|--------|-------|
| 206 | [ENHANCEMENT] Add packages/core integration-test Turbo lane | enhancement | Unassigned | CI/DevOps improvement |
| 200 | Add in built code indexing based on semble | enhancement | Unassigned | Code intelligence feature |
| 198 | Add GLM5.1, Deepseek 4 pro and Kimi 2.6 to fireworks.ai list | model | Unassigned | Provider model addition |
| 191 | [ENHANCEMENT] clarify migration effects | enhancement | Unassigned | Documentation |
| 172 | Opencode Go plan not available as provider | model | Unassigned | Provider availability |
| 166 | [ENHANCEMENT] auto-expand code edits | enhancement | Unassigned | UX improvement |
| 161 | [ENHANCEMENT] Make Z.ai GLM max output configurable | enhancement | Unassigned | Settings improvement |
| 156 | [ENHANCEMENT] Remote Access: WebUI and Discord Bot Integration | enhancement | @navedmerchant claimed | Complex feature, multiple contributors discussing |
| 151 | Hope to support LSP function | enhancement | Unassigned | LSP integration |
| 150 | It is hoped that hook mechanism will be supported | enhancement | Unassigned | Needs elaboration per maintainer |
| 147 | New way to handle custom providers | enhancement | Unassigned | Provider management redesign |
| 119 | Support choosing terminal profile for inline execution | enhancement | Unassigned | Terminal configuration |
| 108 | new provider suggestion | model | Unassigned | Provider addition |
| 87 | azure openAI codex | model | Unassigned | Provider addition |
| 73 | Consider setting tool_choice='required' globally | — | Unassigned | API behavior change |
| 62 | Follow up bundled marketplace cleanup for stale organizationMcps | — | Unassigned | Cleanup task |
| 33 | Repair Zoo Code changelog and Changesets release workflow | — | Unassigned | Release infrastructure |
| 127 | [ENHANCEMENT] Add compact slash commands | — | Unassigned | UX feature with detailed mockup in comments |

---

### P4 — Icebox / Architectural (15)

| # | Title | Labels | Status | Notes |
|---|-------|--------|--------|-------|
| 118 | [ENHANCEMENT] Update CI to use sliced coverage and merged-report guard | enhancement | Unassigned | CI architecture |
| 117 | [ENHANCEMENT] Add per-area Turbo coverage tasks and merge task | enhancement | Unassigned | CI architecture |
| 116 | [ENHANCEMENT] Add dist-scoped Vitest config and Turbo task | enhancement | Unassigned | Testing infrastructure |
| 115 | [ENHANCEMENT] Add four area-scoped Vitest configs | enhancement | Unassigned | Testing infrastructure |
| 114 | [ENHANCEMENT] Wire bundle as explicit Turbo dep; remove npm pretest* hooks | enhancement | Unassigned | Build system |
| 104 | [ENHANCEMENT] Suppress actionable controls for resolved asks | enhancement | Unassigned | Interaction flow |
| 103 | [ENHANCEMENT] Extract ChatView ask/footer state | enhancement | Unassigned | Refactor prerequisite |
| 47 | [ENHANCEMENT] Make coverage tasks more cacheable in CI | enhancement | Unassigned | CI optimization |
| 26 | [Refactor] Extract WebviewBridge from ClineProvider.ts | — | Unassigned | Part of issue #8 refactor epic |
| 25 | [Refactor] Extract system prompt & context management from Task.ts | — | Unassigned | Part of issue #8 refactor epic |
| 24 | [Refactor] Extract ApiRequestHandler from Task.ts | — | Unassigned | Part of issue #8 refactor epic |
| 23 | [Refactor] Extract task history persistence from ClineProvider.ts | — | Unassigned | Part of issue #8 refactor epic |
| 22 | [Refactor] Extract TaskStackManager from ClineProvider.ts | — | Unassigned | Part of issue #8 refactor epic |
| 21 | [Refactor] Extract Ask/Say interaction flow from Task.ts | — | Unassigned | Part of issue #8 refactor epic |
| 20 | [Refactor] Extract provider profile management from ClineProvider.ts | — | Unassigned | Part of issue #8 refactor epic |
| 19 | [Refactor] Extract checkpoint management wrapper from Task.ts | — | Unassigned | Part of issue #8 refactor epic |
| 18 | [Refactor] Extract UsageTracker from Task.ts | — | Unassigned | Part of issue #8 refactor epic |
| 17 | [Refactor] Extract ClineMessagesStore from Task.ts | — | Unassigned | Part of issue #8 refactor epic |
| 126 | [ENHANCEMENT] Add concurrent conversation sidebar and task switching | — | @allquixotic claimed | Complex feature |
| 124 | [ENHANCEMENT] Improve Amazon Bedrock model discovery | — | @allquixotic claimed | Provider improvement |
| 8 | [ENHANCEMENT] Code refactor on monolith files (epic) | enhancement | Unassigned | Parent epic for #17-#26 |

---

## Part B: Open Pull Requests

### PRs with CI Failures (potential targets for fixing)

| PR # | Title | Author | Mergeable | CI Status | Notes |
|------|-------|--------|-----------|-----------|-------|
| 207 | [Chore] Split packages/core integration coverage | roomote (bot) | MERGEABLE | ❌ FAILURE (windows-latest unit test) | Draft PR, roomote-generated |
| 13 | feat: migrate Roo config handling to Zoo config | @taltas | UNKNOWN | ❌ FAILURE (windows-latest + codecov) | Draft PR, stale |

### PRs by roomote (automated)

| PR # | Title | Mergeable | CI Status |
|------|-------|-----------|-----------|
| 207 | [Chore] Split packages/core integration coverage | MERGEABLE | ❌ Windows CI failure |
| 170 | (Draft) Vertex AI multi-region endpoints fix | — | Referenced in issue #165 |
| 153 | Potential fix for UI disappearing (issue #192) | — | Referenced in issue #192 |

### PRs by Renovate (dependency updates)

| PR # | Title | Mergeable | CI Status |
|------|-------|-----------|-----------|
| 205 | Dependency update | MERGEABLE | ✅ All checks passing |

### PRs by Contributors

| PR # | Title | Author | Mergeable | CI Status | Review |
|------|-------|--------|-----------|-----------|--------|
| 28 | Extract Task usage tracking | @taltas | MERGEABLE | ✅ All passing | REVIEW_REQUIRED |
| 13 | feat: migrate Roo config handling to Zoo config | @taltas | UNKNOWN | ❌ Failures | REVIEW_REQUIRED |

### All PRs with REVIEW_REQUIRED status

All open PRs currently have `reviewDecision: REVIEW_REQUIRED`, meaning no PRs have been approved by maintainers yet. This suggests the project is still in early active development.

---

## Part C: Issue Clusters (grouped by theme)

### 🔧 Refactor Epic (#8 → #17–#26)
A major refactoring effort to decompose monolithic files (`Task.ts` ~4000 LOC, `ClineProvider.ts`). 10 sub-issues created by @doctarock. References upstream issues in cline/cline#3095 and RooCodeInc/Roo-Code#6513.

### 🤖 Provider / Model Requests (#87, #108, #172, #198)
Requests to add or fix AI provider integrations (Azure OpenAI, fireworks.ai models, Opencode Go).

### 🐛 Bug Cluster — API/Model Issues (#186, #190, #201)
Bugs related to specific model API interactions (Anthropic tool_use, DeepSeek reasoning_content, Grok diff parsing).

### 🎨 UI/UX Improvements (#120, #127, #152, #154, #157, #166)
Various UI polish and feature requests.

### 🏗️ CI/Testing Infrastructure (#47, #114–#118, #206)
Testing and CI pipeline improvements, mostly authored by the roomote bot.

### 🔒 Security (#169)
Symlink-based bypass of VS Code workspace read protection.

---

## Part D: Recommended First Targets for PR Contribution

Based on: unassigned, clear scope, high impact, low risk of conflicts with ongoing work.

### Tier 1 — Quick Wins (1-2 hours)

1. **#193** — Fix `roo-diagnostics-` → `zoo-diagnostics-` prefix (branding cleanup)
   - Clear scope: single string replacement in temp file naming
   - Self-contained, no dependencies
   - Already analyzed by commenter with exact location

2. **#203** — Update outdated user-agent string
   - Simple config change
   - Clear requirements

### Tier 2 — Solid Bugs (2-4 hours)

3. **#190** — Fix Anthropic `tool_use`/`tool_result` block handling
   - Critical bug affecting all Anthropic users
   - Well-documented failure mode
   - Likely a state management issue in API request flow

4. **#188** — Fix revert functionality
   - Core feature completely broken
   - High user impact

5. **#82** — Fix Windows shell detection (cmd.exe vs powershell)
   - Platform-specific bug
   - Clear repro conditions

### Tier 3 — Meaningful Enhancements (4-8 hours)

6. **#102 / #105** — Improve auto-approval UX flow
   - Two related issues that could be addressed together
   - UI interaction polish

7. **#157** — Implement configurable font size
   - Multiple workarounds already proposed in comments
   - Settings UI addition

---

## Part E: Contributor Activity Summary

| Contributor | Role | Issues Claimed/Commented |
|-------------|------|--------------------------|
| @navedmerchant | Core maintainer | #156 claimed, #151, #192, #150 comments |
| @kyr0 | Active contributor | #156, #157 architecture comments, #164 claimed |
| @allquixotic / coorbin | Contributor | #124, #126, #127, #134 claimed |
| @edelauna | Contributor | #156 comments, #154 comment |
| @doctarock | Refactor lead | #8 epic owner (split into #17-#26) |
| @roomote | Bot (automated) | PRs #153, #170, #207 + comments |
| @proyectoauraorg | Contributor | #193 analysis |
| @taltas | Contributor | PRs #13, #28 |

---

*This index is auto-generated from `gh` CLI data. Update by running the fetch commands in `upstream-sync/sync.sh`.*
