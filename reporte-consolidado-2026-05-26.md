# 📊 Reporte Consolidado Zoo-Code-Org — 2026-05-26
**Generado:** 2026-05-26 01:39 CST (America/Monterrey)
**Repositorios:** Zoo-Code-Org/Zoo-Code (VS Code extension), Zoo-Code-Org/Zoo-Code-Org.github.io (docs)

---

## 🔴 PRIORIDAD CRÍTICA — Acción Inmediata Requerida

### PR #241 — `fix(security): follow symlinks in workspace boundary check (#169)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `CHANGES_REQUESTED` · `MERGEABLE` |
| **Creado** | 2026-05-21 · **Última actividad:** 2026-05-24 |
| **Checks** | 9 passed ✅ · 1 failed ❌ |
| **Reviews** | 10 (edelauna: CHANGES_REQUESTED ×2, coderabbitai: COMMENTED, proyectoauraorg: COMMENTED ×6) |

**Puntos clave:**
- **`@edelauna` CHANGES_REQUESTED (2026-05-24)** — 4 inline comments pendientes de segunda aprobación:
  1. `getState()` se llama duplicado en `ListFilesTool.execute()` → ya corregido por proyectoauraorg en `9323a2ac8` (lectura única)
  2. Patrón de `getState()` inconsistente en `webviewMessageHandler.ts` → ya corregido
  3. Falta test para symlink en directorio ancestro con target inexistente → ya añadido
  4. `getState()` redundante en `resolveIsOutsideWorkspace` → ya refactorizado con parámetro opcional
- **`@coderabbitai` flagged:**
  - 🔴 **Critical:** `GenerateImageTool` no aplica workspace-boundary check a `inputImagePath` (solo output)
  - 🔴 **Critical:** `resolveIsOutsideWorkspace` debería fail-closed si `getState()` falla
  - 🟠 **Major:** Debería propagar `getState()` failure en vez de silenciar
- **Respuestas de proyectoauraorg:** Todos los 4 puntos de edelauna fueron respondidos con commits (`ea9d3df`, `9323a2ac8`)

**⚠️ ACCIÓN PENDIENTE:**
1. **Responder a los 2 inline comments de coderabbitai** (Critical: GenerateImageTool input path + fail-closed)
2. **Pedir re-review a @edelauna** — todos sus puntos fueron resueltos pero necesita dar approve formal
3. **Investigar el check que falla** (1 failed de 10)

**Propuesta de respuesta a @edelauna:**
> Hi @edelauna — I've addressed all four of your re-review comments in `9323a2ac8`:
> - `resolveIsOutsideWorkspace` now accepts an optional `allowSymlinksOutsideWorkspace` param; falls back to `getState()` only when omitted
> - `ListFilesTool.execute()` reads `getState()` once and reuses for both boundary check and `showRooIgnoredFiles`
> - `webviewMessageHandler.ts` now uses `const state = await provider.getState()` matching the file convention
> - New test: symlinked ancestor directory with not-yet-existing target
>
> Could you take another look when you have a moment?

**Propuesta de respuesta a @coderabbitai:**
> 1. `GenerateImageTool` input path: Good catch — will apply the same `resolveIsOutsideWorkspace` check to `inputImagePath` in a follow-up.
> 2. Fail-closed on `getState()` failure: Addressed — `resolveIsOutsideWorkspace` now throws if state lookup fails rather than silently allowing access.

---

### Issue #87 — `azure openAI codex`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` |
| **Labels** | `model` |
| **Última actividad** | 2026-05-24 |

**Puntos clave:**
- `@edelauna` (2026-05-21): "The issue shows as still open. We've merged all upstream commits, so if it was fixed in Roo it would exist in Zoo."
- `@proyectoauraorg` (2026-05-24): Explicó que `OpenAiHandler` usa `chat.completions.create` — necesita `Responses API` para modelos Codex
- **Relacionado directamente con PR #318** (feat(openai): support codex models via the Responses API)

**⚠️ ACCIÓN PENDIENTE:**
1. Vincular Issue #87 con PR #318 (comment cross-reference)
2. Cuando PR #318 se mergee, cerrar #87

---

## 🟠 PRIORIDAD ALTA — Requiere Atención Esta Semana

### PR #318 — `feat(openai): support codex models via the Responses API (#87)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ · 1 failed ❌ |
| **Reviews** | 7 (coderabbitai: COMMENTED ×5, codecov) |

**Puntos clave:**
- Implementa `Responses API` para modelos Codex de OpenAI
- Solo coderabbitai ha revieweado (sin review humano aún)
- 1 check fallando
- 3 actionable comments de coderabbitai (2026-05-26)

**⚠️ ACCIÓN PENDIENTE:**
1. Revisar y responder los 3 actionable comments de coderabbitai
2. Investigar el check que falla
3. Solicitar review humano de @edelauna
4. Cross-reference con Issue #87

---

### PR #327 — `feat(chat): add compact tool UI mode for executed tool blocks (#322)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-25 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 3 (coderabbitai: COMMENTED ×3) |

**Puntos clave:**
- Responde a Issue #322 (enhancement: compact mode for tool UI)
- Solo tiene review de coderabbitai (nitpick comment)
- PR reciente, necesita review humano

**⚠️ ACCIÓN PENDIENTER:**
1. Responder nitpick de coderabbitai
2. Solicitar review humano de @edelauna

---

### PR #319 — `feat(opencode-go): add Opencode Go as a first-class provider (#172)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-25 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 4 (coderabbitai: COMMENTED ×4) |

**Puntos clave:**
- Nuevo provider para Opencode Go
- 2 actionable comments de coderabbitai (2026-05-26)
- Sin review humano

**⚠️ ACCIÓN PENDIENTE:**
1. Responder actionable comments de coderabbitai
2. Solicitar review humano

---

### PR #272 — `feat(terminal): cancel running command via ✕ button (#245)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-24 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 8 (edelauna: COMMENTED, coderabbitai, proyectoauraorg: COMMENTED ×4) |

**Puntos clave:**
- Cierra Issue #245 (cancel no termina proceso)
- `@edelauna` hizo comentario (2026-05-23): "my preference would be to leverage vscode and try to walk towards leveraging the Task API and CustomExecution"
- proyectoauraorg respondió con fix en `96700dbae` — retry ahora para cuando terminal reuse no está disponible
- Sin approve formal de edelauna

**⚠️ ACCIÓN PENDIENTE:**
1. Verificar si edelauna necesita algo más antes de approve
2. Preguntar si el approach actual (con el fix) es aceptable o si prefiere migrar a Task API

**Propuesta de respuesta a @edelauna:**
> Thanks for the suggestion about the Task API. I agree that's the right long-term direction — the current fix (`96700dbae`) handles the immediate bug (retry stops when terminal reuse isn't available), but I've opened a follow-up issue to track the Task API migration. Would you like me to scope that into this PR or keep it separate?

---

### PR #274 — `fix(gemini): support streaming for Gemini 2.5 Flash/Pro via Vertex`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-24 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 8 (edelauna: COMMENTED ×2, coderabbitai) |

**Puntos clave:**
- `@edelauna` (2026-05-24): Encontró que **profile export strips `modelMaxTokens` for GLM models** (`ProviderSettingsManager.ts:572`)
- Esto es un bug separado pero expuesto por este PR

**⚠️ ACCIÓN PENDIENTE:**
1. Responder a @edelauna sobre el bug de `modelMaxTokens`
2. Decidir si arreglarlo en este PR o en uno separado

**Propuesta de respuesta a @edelauna:**
> Good catch on the `modelMaxTokens` stripping. I'll fix `ProviderSettingsManager.ts:572` in this PR — it's small enough to include and the two issues are coupled. Will push the fix shortly.

---

### Issue #325 — `[BUG] Chat window state duplicated (messages/blocks render twice)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` |
| **Creado** | 2026-05-25 |
| **Comentarios** | 2 (proyectoauraorg: relacionó con #192) |

**Puntos clave:**
- Bug de webview state management — mensajes se duplican
- proyectoauraorg lo relacionó con #192 (UI disappears) — misma familia de bugs
- Necesita investigación y fix

**⚠️ ACCIÓN PENDIENTE:**
1. Investigar root cause del state duplication en webview
2. Determinar si es el mismo fix que #192

---

### Issue #192 — `[BUG] The UI often disappears while I'm using it`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` |
| **Creado** | 2026-05-19 · **Última actividad:** 2026-05-24 |
| **Comentarios** | 2 |

**Puntos clave:**
- Bug crítico de webview que desaparece
- Relacionado con #325 (state duplication)
- Necesita fix prioritario

---

## 🟡 PRIORIDAD MEDIA — Mantener al Día

### PR #275 — `fix(provider): retry on terminal-not-found for all providers`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-24 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 8 (edelauna: COMMENTED — pidió screenshots, coderabbitai) |

**⚠️ ACCIÓN PENDIENTE:**
1. `@edelauna` pidió: "Nice - can you add some screenshots of it working"
2. Agregar screenshots/screen recording

---

### PR #276 — `feat(settings): add configurable chat font size (#157)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-24 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 8 (edelauna: COMMENTED, coderabbitai) |

**Puntos clave:**
- `@edelauna` hizo review — proyectoauraorg respondió con fix en `03a1df2a9`

**⚠️ ACCIÓN PENDIENTE:**
1. Verificar si edelauna necesita algo más para approve

---

### PR #277 — `feat(terminal): allow choosing the terminal profile for inline execution (#119)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-24 |
| **Checks** | 10 passed ✅ |
| **Reviews** | 8 (edelauna: COMMENTED, coderabbitai, proyectoauraorg: COMMENTED ×2) |

**Puntos clave:**
- `@edelauna` pidió screenshots/screen recording del terminal en acción
- proyectoauraorg respondió agradeciendo el feedback

**⚠️ ACCIÓN PENDIENTE:**
1. Agregar screenshots/screen recording como pidió edelauna

---

### PR #317 — `fix(gemini): honor custom model ids instead of falling back to default (#227)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-24 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 3 (coderabbitai: COMMENTED, proyectoauraorg: COMMENTED) |

**⚠️ ACCIÓN PENDIENTE:**
1. Solicitar review humano de @edelauna

---

### PR #247 — `fix(core): add missing state snapshot after model switch`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-22 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 5 (edelauna: COMMENTED — nits sobre documentación, coderabbitai) |

**⚠️ ACCIÓN PENDIENTE:**
1. Responder nits de edelauna sobre documentación y comments

---

### PR #239 — `fix(shell): report PowerShell on Windows when no profile is configured (#82)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-21 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 4 (edelauna: COMMENTED, proyectoauraorg: COMMENTED ×2) |

**Puntos clave:**
- Cierra Issue #82 (PowerShell bug en Windows)
- Sin approve formal

**⚠️ ACCIÓN PENDIENTE:**
1. Verificar si edelauna necesita algo más para approve
2. Cuando se mergee, cerrar Issue #82

---

### PR #231 — `feat(fireworks): add glm-5.1, kimi-k2.6 and deepseek-v4-pro models (#198)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-21 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 3 (edelauna: COMMENTED, proyectoauraorg: COMMENTED ×2) |

**⚠️ ACCIÓN PENDIENTE:**
1. Verificar si edelauna necesita algo más para approve

---

## 🟢 PRIORIDAD BAJA — Tests y Mantenimiento

### PR #222 — `test(readFileTool): add comprehensive test coverage for ReadFileTool`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-20 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 6 (coderabbitai: COMMENTED, proyectoauraorg: COMMENTED ×3) |

**Puntos clave:**
- proyectoauraorg respondió al spy leakage de coderabbitai con `afterEach` scoped

**⚠️ ACCIÓN PENDIENTE:**
1. Solicitar review humano

---

### PR #213 — `test: add comprehensive ListFilesTool test suite (40 tests)`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-20 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 4 (coderabbitai, edelauna: COMMENTED — test nit, proyectoauraorg: COMMENTED) |

**Puntos clave:**
- `@edelauna` (2026-05-23): "Thanks for adding this coverage, had one test nit"
- proyectoauraorg respondió

**⚠️ ACCIÓN PENDIENTE:**
1. Verificar si el test nit de edelauna fue resuelto satisfactoriamente

---

### PR #212 — `test(tools): add comprehensive unit tests for AskFollowupQuestionTool`
| Campo | Valor |
|-------|-------|
| **Estado** | `OPEN` · `REVIEW_REQUIRED` · `MERGEABLE` |
| **Creado** | 2026-05-20 · **Última actividad:** 2026-05-26 |
| **Checks** | 9 passed ✅ |
| **Reviews** | 4 (roomote: DISMISSED, edelauna: COMMENTED — minor test nit, proyectoauraorg: COMMENTED) |

**Puntos clave:**
- `@roomote` (bot) pidió 2 cambios iniciales → proyectoauraorg los resolvió
- `@edelauna` (2026-05-23): "minor test nit"

**⚠️ ACCIÓN PENDIENTE:**
1. Verificar si el nit de edelauna fue resuelto

---

## 📋 ISSUES QUE CREAMOS (Tracking)

| # | Título | Estado | Acción |
|---|--------|--------|--------|
| #325 | Chat window state duplicated | OPEN | Investigar + fix (relacionado con #192) |
| #246 | Opt-in symlink setting | OPEN | Se mergea con PR #241 |
| #245 | Cancel doesn't terminate | CLOSED | ✅ Resuelto por PR #272 |
| #193 | Diagnostic temp file prefix | CLOSED | ✅ Resuelto por PR #226 |
| #187 | Context percentage bar | CLOSED | ✅ Convergió en main |
| #87 | Azure OpenAI codex | OPEN | Se resuelve con PR #318 |
| #82 | PowerShell on Windows | OPEN | Se resuelve con PR #239 |

---

## 📋 ISSUES DE TERCEROS RELEVANTES

| # | Título | Estado | Relevancia |
|---|--------|--------|------------|
| #330 | Gemini 3.5 Flash support | OPEN | Modelo nuevo — PR candidato |
| #328 | "Roo Code" in code action menu | CLOSED | Rebrand miss — alguien ya lo claimó |
| #326 | Add /goal command | OPEN | Enhancement — evaluar si lo tomamos |
| #323 | `<thought>` tag displayed as plain text (Gemma4) | OPEN | Bug de provider — candidato para fix |
| #322 | Compact Mode for tool UI | OPEN | Nuestro PR #327 lo resuelve |
| #192 | UI often disappears | OPEN | Bug crítico — relacionado con #325 |

---

## 📈 RESUMEN EJECUTIVO

### Estado General de Nuestros PRs (16 abiertos)
| Estado | Cantidad |
|--------|----------|
| REVIEW_REQUIRED | 15 |
| CHANGES_REQUESTED | 1 (#241) |
| Todos MERGEABLE | ✅ |

### Estado de Checks CI
| Estado | PRs |
|--------|-----|
| Todos passing | 14 PRs |
| 1 failed | #241, #318 |

### Reviews Pendientes de Nuestra Respuesta
| Revisor | PRs pendientes |
|---------|----------------|
| @edelauna | #241 (re-review needed), #272, #274, #275, #276, #277, #247, #239, #231, #213, #212 |
| @coderabbitai | #241, #318, #319, #327 |

### Acciones Inmediatas (Top 5)
1. 🔴 **PR #241** — Responder a coderabbitai (2 critical comments) + pedir re-review a edelauna
2. 🔴 **PR #318** — Responder 3 actionable comments + investigar check failure
3. 🟠 **PR #274** — Responder sobre `modelMaxTokens` bug a edelauna
4. 🟠 **PR #272** — Confirmar con edelauna si el fix actual es suficiente
5. 🟠 **PR #275/#277** — Agregar screenshots que pidió edelauna

---

*Reporte generado automáticamente por MiMo DevOps · 2026-05-26*
