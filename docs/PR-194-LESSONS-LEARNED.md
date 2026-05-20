# PR #194 — Lessons Learned

> Post-mortem: Upstream PR attempt for Issue #193 (diagnostics prefix fix)
> Date: 2026-05-19

## Timeline

| Date          | Event                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-19 AM | PR #194 opened upstream targeting Issue #193 (`roo-` → `zoo-` prefix in diagnostics)                                              |
| 2026-05-19 PM | PR #194 closed as "duplicate" of PR #199                                                                                          |
| 2026-05-19 PM | Investigation: PR #199 is **not** a duplicate — it fixes `roo-deploy/` prefix (CompanionDeployer.ts), a completely different file |
| 2026-05-19 PM | PR #16 opened on fork with clean scope (2 files only) for upstream submission                                                     |

## Root Cause Analysis

### Why PR #194 was closed incorrectly

PR #194 and PR #199 both address `roo-` remnants from the same Issue #193, but fix **different files**:

| PR   | Target File             | Prefix Fixed                            |
| ---- | ----------------------- | --------------------------------------- |
| #194 | `diagnosticsHandler.ts` | `roo-diagnostics-` → `zoo-diagnostics-` |
| #199 | `CompanionDeployer.ts`  | `roo-deploy/` → `zoo-deploy/`           |

The upstream maintainer likely saw both PRs reference #193 and assumed they were duplicates without checking the actual file diffs.

### Contributing Factors

1. **Broad Issue Scope**: Issue #193 covers ALL `roo-` remnants across the codebase, making it possible for multiple PRs to target the same issue legitimately
2. **PR Description**: Our PR #194 description could have been more explicit about the narrow file scope
3. **No Cross-Reference**: Neither PR mentioned the other, making it easy to confuse them

## Lessons & Action Items

### 1. Narrow PR Scope Even on Broad Issues

- **Lesson**: When an issue covers multiple files/areas, always title the PR to indicate the specific file or component being fixed
- **Action**: Use titles like `fix: update diagnostics prefix from roo- to zoo- (#193)` (specific) instead of `fix: update remaining roo- prefixes (#193)` (vague)
- **Applied**: ✅ PR #16 uses specific title

### 2. Cross-Reference Existing PRs

- **Lesson**: Before opening a PR, check if there are other PRs targeting the same issue
- **Action**: Add to pre-submission checklist: "Check for existing PRs on same issue and cross-reference in description"
- **Applied**: ✅ Will be added to CONTRIBUTION-PLAYBOOK.md

### 3. Explicit Scope Declaration in Body

- **Lesson**: The PR body should explicitly state which files are changed and which are NOT
- **Action**: Use "Changes (N files):" format with explicit file listing
- **Applied**: ✅ PR #16 body lists exact files

### 4. Error Handling for Fork PRs

- **Lesson**: `gh pr create` with heredoc syntax fails on shell quoting issues
- **Action**: Use `--body-file` with a temp file instead of inline `--body` with heredocs
- **Applied**: ✅ PR #16 used `--body-file /tmp/pr-body-v2.md`

## PR #16 Status

| Check         | Status                                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| Branch        | `fix/193-diagnostic-prefix-v2`                                                     |
| Files changed | 2 (diagnosticsHandler.ts + spec)                                                   |
| typecheck     | ✅ Pass                                                                            |
| lint          | ✅ Pass                                                                            |
| tests         | ✅ 5/5 pass                                                                        |
| Fork PR       | [proyectoauraorg/Zoo-Code#16](https://github.com/proyectoauraorg/Zoo-Code/pull/16) |
| Upstream PR   | Pending submission                                                                 |
