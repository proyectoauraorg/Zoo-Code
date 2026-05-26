# 🔍 Auditoría de .gitignore — Zoo-Code-contrib

> **Fecha:** 2026-05-26 · **Objetivo:** Prevenir fugas de archivos personales al staging area o historial.

---

## 1. Clasificación de Archivos

### ✅ CÓDIGO FUENTE LEGÍTIMO (del upstream Zoo Code)
- `src/` — Extensión VS Code (823 .ts files)
- `webview-ui/` — React UI (349 .tsx files)
- `packages/` — 9 paquetes @roo-code/*
- `apps/` — cli, vscode-e2e, vscode-nightly, web-evals, web-roo-code
- `locales/` — Traducciones i18n
- `schemas/` — JSON schemas
- `scripts/` — Build/CI scripts
- `releases/` — Release images (upstream)
- `CHANGELOG.md`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `PRIVACY.md`, `SECURITY.md`, `LICENSE`
- `AGENTS.md` — Agent guidance (upstream)
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`
- `.prettierrc.json`, `.tool-versions`, `codecov.yml`, `knip.json`, `renovate.json`
- `.changeset/` — Changesets
- `.github/` — CI/CD workflows + templates
- `.husky/` — Git hooks
- `.vscode/` — VS Code settings (upstream)
- `.git-blame-ignore-revs`, `.gitattributes`, `.gitconfig`, `.gitignore`, `.nvmrc`
- `ellipsis.yaml`

### ⚠️ ARCHIVOS PERSONALES/LOCALES (DEBEN IGNORARSE)
| Archivo | Tamaño | Riesgo | Estado |
|---------|--------|--------|--------|
| `aura-avatar-cuadrado.png` | 512KB | **ALTO** — imagen personal | ❌ NO en .gitignore |
| `ZOO_CODE_COMMUNITY_INTEL.md` | 18KB | **ALTO** — dossier de inteligencia privado | ❌ NO en .gitignore |
| `ZOO_WORK_STYLE_GUIDE.md` | 10KB | **MEDIO** — guía de estilo personal | ❌ NO en .gitignore |
| `ZOO_REPO_CONTEXT_PROMPT.md` | 5KB | **MEDIO** — prompt de reconstrucción | ❌ NO en .gitignore |
| `https-discord-com-channels-*.md` | 7KB | **ALTO** — dump de Discord | ❌ NO en .gitignore |
| `progress.txt` | 2.6KB | **MEDIO** — notas personales | ❌ NO en .gitignore |

### 🔧 CONFIGURACIÓN DE DESARROLLO (aceptable en repo)
- `.env.sample` — Template de env (upstream)
- `.roo/` — Configuración de Roo Code (excepto `mcp.json` que ya está ignorado)
- `.claude/` — Configuración de Claude
- `abandoned-prs/`, `automation/`, `ci-analysis/`, `issue-research/`, `prompts/`, `worktrees/` — Carpetas de trabajo vacías

### 🗑️ ARCHIVOS RASTREADOS QUE DEBERÍAN ESTAR IGNORADOS
| Archivo | Problema |
|---------|----------|
| `.DS_Store` (x11) | macOS metadata, ya en .gitignore pero TRACKEADOS |
| `.turbo/cache/*.tar.zst` (x20+) | Build cache, `.turbo` en .gitignore pero cache/ no |

---

## 2. Problemas Detectados en .gitignore Actual

### P1 — Archivos personales sin ignorar
- `aura-avatar-cuadrado.png` — imagen personal de 512KB
- `ZOO_*.md` — documentos de trabajo personal (3 archivos)
- `https-discord-com-*.md` — dumps de Discord
- `progress.txt` — notas personales

### P2 — .DS_Store ya trackeado
- `.DS_Store` está en .gitignore pero 11 archivos ya están en el historial
- Necesita: `git rm --cached` para dejar de rastrearlos

### P3 — .turbo/cache parcialmente ignorado
- `.turbo` está en .gitignore pero los archivos ya están en el historial
- Los `.tar.zst` en `.turbo/cache/` son build artifacts

### P4 — Patrones faltantes
- No hay patrón para `*.png` personales (solo `releases/` tiene imágenes)
- No hay patrón para `ZOO_*.md` o `*_INTEL.md`
- No hay patrón para dumps de Discord/chat

---

## 3. Mejoras Propuestas para .gitignore

```gitignore
# === AGREGAR AL FINAL DE .gitignore ===

# Personal files (proyectoauraorg)
ZOO_*.md
aura-*.png
progress.txt
https-discord-com-*.md
*_INTEL.md
*_STYLE_GUIDE.md
*_CONTEXT_PROMPT.md
*_COMMUNITY_*.md

# Build cache (redundant but explicit)
.turbo/cache/

# macOS metadata (force untrack)
**/.DS_Store

# Work agent artifacts
abandoned-prs/
automation/
ci-analysis/
issue-research/
prompts/
worktrees/
```

---

## 4. Comandos de Limpieza Recomendados

```bash
# 1. Dejar de rastrear .DS_Store
git rm -r --cached '**/.DS_Store'

# 2. Dejar de rastrear archivos personales
git rm --cached aura-avatar-cuadrado.png
git rm --cached ZOO_CODE_COMMUNITY_INTEL.md
git rm --cached ZOO_WORK_STYLE_GUIDE.md
git rm --cached ZOO_REPO_CONTEXT_PROMPT.md
git rm --cached "https-discord-com-channels-1497384592494-valiant-eagle.md"
git rm --cached progress.txt

# 3. Commit de limpieza
git add .gitignore
git commit -m "🦓 chore(gitignore): prevent personal files from leaking to upstream"
```

---

## 5. Prevención de Fugas Futuras

### Pre-commit hook sugerido
```bash
#!/bin/bash
# .husky/pre-commit — Block personal files from staging
BLOCKED_PATTERNS=(
  "ZOO_*.md"
  "aura-*.png"
  "progress.txt"
  "https-discord-*"
  "*_INTEL.md"
  "*_COMMUNITY_*"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if git diff --cached --name-only | grep -q "$pattern"; then
    echo "❌ ERROR: Archivo personal bloqueado: $pattern"
    echo "   No commitear archivos personales al fork de Zoo Code."
    exit 1
  fi
done
```

### Regla de oro
> **Antes de `git add` siempre verificar:** `git diff --cached --name-only` no debe contener archivos que no sean código fuente legítimo del proyecto Zoo Code.
