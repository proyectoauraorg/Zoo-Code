# 🦓 Guía de Estilo de Trabajo — Dr. Armando Vaquera / Proyecto Aura

> **Propósito:** Documento vivo que captura convenciones implícitas, patrones de trabajo y estilo operativo extraídos del análisis de 68 commits en Zoo-Code-contrib + 120+ commits en zSys/Zordon OS + documentación de la comunidad Zoo Code.
> **Última actualización:** 2026-05-26
> **Alcance:** Todos los repositorios gestionados por proyectoauraorg.

---

## 1. Convención de Commits

### Formato estándar
```
🦓 <type>(<scope>): <description>
```

### Prefijo obligatorio
- **🦓 (cebra)** = mascota de Zoo Code community
- Reemplaza el 🦘 original de Roo Code por la cebra de Zoo Code
- Va SIEMPRE al inicio del subject line

### Tipos válidos
| Tipo | Uso | Frecuencia observada |
|------|-----|---------------------|
| `fix` | Corrección de bugs | 44% (30/68 en Zoo-Code) |
| `test` | Tests nuevos o mejorados | 31% (21/68) |
| `feat` | Nueva funcionalidad | 16% (11/68) |
| `refactor` | Refactorización sin cambio de comportamiento | 6% (4/68) |
| `docs` | Documentación | zSys: 40 commits |
| `chore` | Mantenimiento, deps, CI | zSys: 13 commits |
| `ci` | Cambios en CI/CD | — |
| `perf` | Mejoras de rendimiento | — |
| `style` | Formateo, whitespace | — |

### Scopes observados (Zoo-Code-contrib)
**Por dominio funcional:**
`terminal` · `openai` · `gemini` · `settings` · `shell` · `diff` · `fireworks` · `webview` · `config` · `markdown` · `chat` · `api` · `security` · `tools` · `mimo`

**Por issue number:**
`#169` · `#119` · `#87` · `#266` · `#227` · `#186` · `#172` · `#161` · `#157` · `#245` · `#82` · `#154` · `#193` · `#215` · `#242` · `#322`

### Scopes observados (zSys)
`sesiones` · `voice` · `proxy` · `vault` · `observability` · `sandbox` · `bootstrap` · `hardening` · `security` · `pki` · `agents` · `health` · `ops` · `workers` · `plan` · `audit`

### Convenciones de descripción
- **Imperativo** (no pasado): "add", "fix", "cover", "resolve" — NO "added", "fixed", "covered"
- **Minuscula** al inicio después del scope
- **Referencia al issue** al final: `(#NNN)` o `(#NNN) (#MMM)` si cierra múltiples
- **Sin punto final**
- **Máximo ~72 caracteres** en subject
- **Body** (zSys): párrafos descriptivos. **NUNCA** incluir Co-Authored-By, Reviewed-by, Signed-off-by, ni ninguna firma de atribución externa.

### Ejemplos reales del historial
```
🦓 fix(terminal): resolve profile path[] to first existing candidate (#119)
🦓 test(mimo): assert tool_call_end event on tool_calls finish_reason
🦓 feat(openai): support codex models via the Responses API (#87)
🦓 refactor(terminal): clarify Ctrl+C retry naming and comments per review (#266)
🦓 fix(security): resolve symlinks in workspace boundary check (#169)
```

### Patrón zSys (más elaborado)
```
🦓 docs(sesiones): cierre S-2026-05-25-iga-validacion-audit — validación IGA v3.1 (40→41)
🦓 feat(voice): rediseño UI/UX de voice.html — tema AURORA + toasts + a11y
🦓 fix(proxy): context-safety — _flatten_content dict + _sanitize_messages acotado a budget (#7)
```

---

## 2. Convención de PRs

### Título del PR
Mismo formato que commit: `<type>(<scope>): <description> (#issue)`
- Los PRs de `proyectoauraorg` SIEMPRE referencian el issue upstream
- Ejemplo: `fix(terminal): terminate running process when task is cancelled (#245)`

### Estructura del PR (template oficial Zoo Code)
```markdown
### Related GitHub Issue
Closes: #NNN

### Description
- "How" (implementation details, design choices)
- Anything specific reviewers should pay attention to

### Test Procedure
- Steps to test changes
- How reviewers can reproduce

### Pre-Submission Checklist
- [ ] Issue Linked
- [ ] Scope focused (one major feature/fix per PR)
- [ ] Self-Review done
- [ ] Tests added/updated
- [ ] Documentation Impact considered

### Screenshots / Videos
(For UI changes)

### Documentation Updates
- [ ] No documentation updates required
- [ ] Yes, documentation updates required

### Get in Touch
Discord username for reviewers
```

### Patrón de PRs de Armando
1. **Issue-first**: Siempre `Closes: #NNN`
2. **Commits granulares**: 1-5 commits por PR, cada uno con test incluido
3. **Self-review**: CodeRabbit auto-review + fixes proactivos
4. **Tests-first approach**: Muchos PRs son pure-test (`test(tools):`, `test(mimo):`)
5. **Follow-up pattern**: Fix → test → refactor en PRs separados

---

## 3. Distribución de Trabajo

### Zoo-Code-contrib (68 commits, 7 PRs merged, 1 abierto)
| Categoría | Commits | % |
|-----------|---------|---|
| Fix (bugs) | 30 | 44% |
| Test | 21 | 31% |
| Feature | 11 | 16% |
| Refactor | 4 | 6% |
| WIP/Index | 2 | 3% |

### Áreas de expertise observadas
1. **Terminal/Execution** (7 commits): SIGINT, process cancel, profile selection
2. **Security/Symlinks** (10 commits): workspace boundary, realpath, ENOENT
3. **Provider compat** (7 commits): OpenAI, Gemini, Fireworks, MiMo
4. **Testing infra** (21 commits): cobertura exhaustiva de tools, providers, UI
5. **Diff parser** (4 commits): Grok truncation repair
6. **Settings/UI** (6 commits): font size, chat, webview

### zSys (120+ commits)
| Categoría | Commits |
|-----------|---------|
| docs(sesiones) | 29 |
| feat | 41 |
| docs | 11 |
| fix | 15 |
| chore | 13 |
| refactor | 6 |
| test | 3 |

---

## 4. Estilo de Código

### TypeScript (Zoo-Code-contrib)
- **Imports**: ES modules, `@roo-code/*` packages
- **Types**: TypeScript estricto, interfaces en `@roo-code/types`
- **Testing**: Vitest con `vi.mock()`, `describe/it/expect`
- **Linting**: ESLint con `@roo-code/config-eslint`
- **Formatting**: Prettier (`.prettierrc.json`)
- **Webview**: React + Tailwind CSS
- **Build**: Turborepo monorepo, ESBuild para extensión

### Python (zSys)
- **Arquitectura**: Hexagonal (ports/adapters)
- **Testing**: pytest, markers `slow/integration/chaos/ml/network`
- **Linting**: flake8, black, isort, mypy, bandit
- **Type hints**: Obligatorios en contracts/interfaces
- **Docstrings**: Google style
- **Dependencies**: `requirements.txt` + `uv.lock`

---

## 5. Patrones de Refactorización

### Observados en Zoo-Code-contrib
1. **Extract-and-test**: Extraer lógica → escribir tests → refactorizar
2. **Review-driven refactor**: `refactor(terminal): address review feedback on...`
3. **Naming clarification**: `refactor(terminal): clarify Ctrl+C retry naming and comments per review`
4. **Consolidation**: `refactor(tools): accept optional allowSymlinks in resolveIsOutsideWorkspace; consolidate ListFiles state read`

### Observados en zSys
1. **Session-driven cleanup**: docs(sesiones) → identificar deuda → fix
2. **Dead-code purge**: `chore(hardening): §1 dead-code purge`
3. **Security hardening**: `chore(security): untrack .secrets/ + pre-commit guard`
4. **Observability hygiene**: `chore(observability): add healthchecks`

---

## 6. Relaciones y Alianzas

### Zoo Code Community
| Actor | Rol | Relación |
|-------|-----|----------|
| **edelauna** | Maintainer/lead, único que mergea | **Champion** — mergea sin fricción, co-diseña |
| **0xMink** | Arquitectura, shell, security | **Aliado-par** — "happy to work with you" |
| **Toray** | Founder/admin, handover | Positivo — roles, coordinación |
| **mojomast** | Portable core CLI↔VS Code | Convergente |
| **doctarock** | Refactor ClineProvider.ts | Neutral/colaborativo |
| **James** | Infra/ops + biz-dev | Neutral |
| **Philippe** | Producto/marca | Neutral |
| **allquixotic** | Enhancements (8 PRs) | Neutral; NO tocar issues #124-#134 |

### GitHub Flow
```
proyectoauraorg/Zoo-Code-contrib (fork local)
    → push → proyectoauraorg/Zoo-Code (GitHub fork)
    → PR → Zoo-Code-Org/Zoo-Code (upstream)
    → edelauna review + merge → release
```

---

## 7. Infraestructura de Desarrollo

### Zoo-Code-contrib
- **Package manager**: pnpm (`.tool-versions`: node 22.16.0)
- **Monorepo**: Turborepo (`turbo.json`)
- **CI**: GitHub Actions (7 workflows)
  - `code-qa.yml` — lint + test + compile
  - `e2e.yml` — E2E tests (mocked)
  - `codeql.yml` — security analysis
  - `cli-release.yml` — CLI build + publish
  - `marketplace-publish.yml` — VS Code Marketplace
  - `nightly-publish.yml` — nightly builds
  - `release-validation.yml` — release validation

### zSys
- **Runtime**: Python 3.14, FastAPI
- **Containers**: 25 Docker services (Traefik, NATS, Redis, Vault, Qdrant, Prometheus, Grafana, etc.)
- **MCP servers**: qdrant-hybrid, qdrant-advanced, cognitive-retrieval, aura-context, github
- **Branch model**: `main` + `hardening/session-d` (active) + feature branches
- **Sessions**: docs/SESIONES/ con estándar v4 de cierre

---

## 8. Convenciones Implícitas

1. **Issue-first**: Nunca PR sin issue vinculado
2. **Tests-first**: Antes de fix, escribir test que reproduce el bug
3. **One PR = One fix**: Scope limitado, no mega-PRs
4. **🚫 Sin firmas automáticas**: NUNCA incluir Co-Authored-By, Reviewed-by, Signed-off-by, Generated-by, Assisted-by, AI-assisted, Made with, Powered by, ni ninguna variante. Únicas identidades: **proyectoauraorg** y **drvaquerra (Armando Vaquera)**.
5. **Session pattern (zSys)**: docs(sesiones) como cierre formal con pendientes
6. **Emoji convention**: 🦓 como prefijo de commit (reemplaza 🦘 de Roo)
7. **Language**: Commits en inglés, docs/sesiones en español
8. **Review culture**: CodeRabbit auto-review + fixes proactivos antes de merge
9. **Branch naming**: `feat/NNN-description` o `fix/NNN-description` (issue number)
10. **Trailing emoji**: En docs, usar 🦓🦡🦒🦓🦛🦧🦭🦦 (Zoo diversity)

### ⚠️ REGLA PERMANENTE E INVARIABLE — Anti-Atribución

> **Prohibido en TODO contexto** (commits, archivos, docs, código, comentarios, salidas):
> `Co-Authored-By`, `Reviewed-by`, `Signed-off-by`, `Generated-by`, `Assisted-by`, `AI-assisted`, `Made with`, `Powered by`, o cualquier variante que mencione herramientas, modelos de IA o asistentes externos.
>
> **Únicas identidades permitidas:** `proyectoauraorg` y `drvaquerra (Armando Vaquera)`.
>
> **Implementación:** `git filter-repo` ejecutado el 2026-05-26 eliminó 104 firmas de zSys (498 commits reescritos). Template global `.gitmessage` libre de atribuciones.

---

## 9. Hot Topics Activos (May 2026)

1. **Execution layer / CustomExecution** — follow-up de #245 ofrecido a edelauna
2. **Portable core** — mojomast: runtime CLI↔VS Code (en reorg)
3. **Decouple backend** — 0xMink: VS Code como cliente
4. **Telemetría/negocio** — descuento DeepSeek vence 2026-05-31
5. **PR #327** — compact tool UI, 10/10 checks, awaiting review

---

*Documento generado automáticamente por análisis de git history, GitHub API, y documentación de comunidad.*
