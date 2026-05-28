# 🦓 Zoo Code Repository Context Prompt

> Paste this into any chatbot with repo access to reconstruct full session context.

---

## Identity & Conventions

- **User:** Dr. Armando Vaquera (`proyectoauraorg` / `drvaquerra`)
- **Project:** Zoo Code — fork comunitario de Roo Code, VS Code AI agent extension
- **Repo:** `proyectoauraorg/Zoo-Code-contrib` → upstream `Zoo-Code-Org/Zoo-Code`
- **Emoji:** 🦓 (cebra) como prefijo de commit: `🦓 <type>(<scope>): <description>`
- **Tipos:** feat | fix | test | refactor | docs | chore | ci | perf | style
- **⛔ Anti-Atribución:** NUNCA incluir Co-Authored-By, Reviewed-by, Signed-off-by, Generated-by, Assisted-by, AI-assisted, Made with, Powered by, ni noreply@anthropic.com / noreply@openai.com. Únicas identidades: proyectoauraorg y drvaquerra.

## Architecture

- **Monorepo Turborepo** con pnpm
- `src/` — VS Code extension core (823 .ts files)
- `webview-ui/` — React + Tailwind UI (349 .tsx files)
- `packages/` — 9 paquetes `@roo-code/*` (core, cloud, types, ipc, telemetry, build, config-eslint, config-typescript, vscode-shim)
- `apps/` — cli, vscode-e2e, vscode-nightly, web-evals, web-roo-code
- **Tests:** Vitest, 513 test files
- **Lint:** ESLint + Prettier + knip

## Contribution Status

- **#1 contribuidor humano** — 68 commits, 7 PRs merged, 1 abierto (#327)
- **Champion:** edelauna (único que mergea)
- **Aliado:** 0xMink (arquitectura, security)
- **Branches activas:** feat/322-compact-tool-ui (PR #327, 10/10 ✅), feat/172-opencode-go, feat/87-openai-codex-responses, fix/169-symlink-workspace-boundary, fix/227-gemini-custom-model, + 15 más

## PR Template

```markdown
### Related GitHub Issue
Closes: #NNN
### Description
[How — implementation details]
### Test Procedure
[Steps to test]
### Pre-Submission Checklist
- [ ] Issue Linked
- [ ] Scope focused
- [ ] Self-Review done
- [ ] Tests added/updated
### Get in Touch
Discord: drvaquera
```

## Key Files (read in this order)

1. `README.md` — project overview + Zoo Code philosophy
2. `ZOO_WORK_STYLE_GUIDE.md` — complete style guide (commit conventions, PR patterns, code style, relationships)
3. `ZOO_CODE_COMMUNITY_INTEL.md` — community intelligence dossier (who's who, power map, hot topics)
4. `package.json` — dependencies + scripts
5. `tsconfig.json` — TypeScript config
6. `turbo.json` — monorepo pipeline
7. `AGENTS.md` — agent guidance rules
8. `CONTRIBUTING.md` — contribution guidelines
9. `.github/pull_request_template.md` — PR template
10. `src/eslint.config.mjs` — lint rules

## Tech Stack

- **Runtime:** Node.js 22.16.0, TypeScript 5.8.3
- **Build:** ESBuild + Turborepo
- **UI:** React 18, Tailwind CSS, VS Code Webview
- **Testing:** Vitest, @testing-library/react
- **CI:** GitHub Actions (7 workflows: code-qa, e2e, codeql, cli-release, marketplace-publish, nightly-publish, release-validation)
- **Package manager:** pnpm with lockfile

## Current Hot Topics (May 2026)

1. **Execution layer / CustomExecution** — follow-up de #245
2. **PR #327** — compact tool UI, 10/10 checks, awaiting edelauna review
3. **Portable core** — mojomast: runtime CLI↔VS Code
4. **Decouple backend** — 0xMink: VS Code como cliente
5. **Telemetría/negocio** — descuento DeepSeek vence 2026-05-31

## Related Projects

- **zSys / Zordon OS** — plataforma independiente Python (903 files, 161K LOC, 25 Docker containers)
- **proyectoauraorg** — GitHub org personal
- **Discord:** https://discord.gg/VxfP4Vx3gX
- **Reddit:** https://www.reddit.com/r/ZooCode/
