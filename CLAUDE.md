# CLAUDE.md — ZooCode Monorepo

This file provides guidance to Claude Code when working in this repository.

## Project Overview

ZooCode is a VS Code extension for AI-assisted coding, organized as a **pnpm monorepo** with Turborepo.

## Architecture

```
├── src/                    # VS Code extension (package: "roo-code")
├── webview-ui/             # React webview panel (Vite + React 18)
├── apps/
│   ├── cli/                # Standalone CLI (React 19)
│   ├── vscode-e2e/         # E2E tests
│   ├── vscode-nightly/     # Nightly build
│   └── dashboard/          # ZooDash — Next.js monitoring dashboard
├── packages/
│   ├── types/              # Shared TypeScript types + Zod schemas
│   ├── core/               # Core business logic
│   ├── ipc/                # IPC communication
│   ├── cloud/              # Cloud integration
│   ├── telemetry/          # Telemetry
│   ├── build/              # Build tooling
│   ├── vscode-shim/        # VS Code API mock for testing
│   ├── config-eslint/      # Shared ESLint configs (base, react, next)
│   └── config-typescript/  # Shared TypeScript configs
├── ingest/                 # Python scripts (historian, backfills)
└── deploy/                 # Deployment configs (launchd)
```

## Tech Stack

- **Runtime:** Node.js 20.20.2
- **Package Manager:** pnpm 10.8.1
- **Build Orchestrator:** Turborepo
- **Language:** TypeScript 5.8.3
- **Validation:** Zod 3.25.76 (v3 — do NOT use v4 APIs)
- **Testing:** Vitest 4.x
- **Linting:** ESLint 9.x (flat config)
- **Formatting:** Prettier 3.x
- **Extension:** VS Code Extension Host
- **Dashboard:** Next.js 14 + Tailwind CSS 3 + better-sqlite3

## Key Commands

```bash
# Install all dependencies
pnpm install

# Build everything
turbo build

# Run all tests
turbo test

# Lint all packages
turbo lint

# Type-check all packages
turbo check-types

# Dev: VS Code extension (watch mode)
turbo watch

# Dev: Dashboard
pnpm --filter @zoo/dashboard dev    # http://localhost:3939

# Clean
turbo clean
```

## Branch Strategy

- `main` — stable production code
- `develop` — integration branch for features
- `release` — release preparation
- `feat/*`, `fix/*`, `chore/*` — feature/fix/chore branches

## Conventions

- All packages use flat ESLint config (`eslint.config.mjs`)
- Zod schemas use v3 API exclusively (override pinned in root `package.json`)
- Shared types live in `packages/types/`
- Dashboard-specific types live in `apps/dashboard/src/lib/types.ts`
- Python scripts in `ingest/` use stdlib only (no PyPI dependencies)
- Environment variables for dashboard: see `apps/dashboard/.env.local`

## Git

- **origin:** `git@github.com:proyectoauraorg/Zoo-Code.git`
- **upstream:** `git@github.com:Zoo-Code-Org/Zoo-Code.git`
- Hooks managed by Husky + lint-staged (Prettier on commit)
