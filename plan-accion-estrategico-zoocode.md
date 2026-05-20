# Plan de Acción Estratégico
## Contribuciones de `proyectoauraorg` al Repositorio `Zoo-Code-Org/Zoo-Code`

**Fecha de generación:** 2026-05-19  
**Base de datos:** Auditoría completa de historial + estado actual del repo  
**Autor:** Optimizador MiMo v2.5-pro

---

## 📊 Estado Actual del Repositorio

| Métrica | Valor |
|---------|-------|
| **Repo** | Zoo-Code-Org/Zoo-Code |
| **Estrellas** | 427 ⭐ |
| **Forks** | 35 |
| **Licencia** | Apache 2.0 |
| **Rama principal** | `main` |
| **Última actualización** | 2026-05-19T21:21:32Z |
| **Issues abiertas** | ~50+ |
| **PRs abiertos** | 35 |

---

## 1. PRs Abiertos de `proyectoauraorg` — Acciones Inmediatas

### 1.1 PR #202 — `fix(#199): Shift+Enter inserts newline instead of sending in newline mode`
| Campo | Detalle |
|-------|---------|
| **Estado** | `REVIEW_REQUIRED` |
| **Creado** | 2026-05-19T20:34:23Z |
| **Draft** | No |
| **Conflicto con** | PR #199 (app/roomote) — mismo issue, diferente enfoque |
| **Prioridad** | 🔴 **ALTA** — Bug activo que afecta UX |

**⚡ Acción recomendada:**
1. **Verificar conflictos** con PR #199 de roomote. Si nuestro PR es más completo, comentar en el PR explicando por qué nuestro enfoque es preferible.
2. **Solicitar review** en Discord mencionando que es fix para #199 (issue con múltiples reportes de usuarios).
3. **Agregar tests** si no los incluye — los mantenedores valoran PRs con cobertura.
4. **Rebasear** sobre `main` actual para evitar conflictos de merge.

### 1.2 PR #196 — `refactor: remove stale organizationMcps from MarketplaceManager`
| Campo | Detalle |
|-------|---------|
| **Estado** | `REVIEW_REQUIRED` |
| **Creado** | 2026-05-19T11:48:10Z |
| **Última actualización** | 2026-05-19T21:14:05Z |
| **Conflicto con** | PR #63 (taltas) — mismo tema, PR más antiguo |
| **Prioridad** | 🟡 **MEDIA** — Refactor técnico, no urgente |

**⚡ Acción recomendada:**
1. **Verificar si PR #63 de taltas** (miembro del equipo) ya cubre lo mismo. Si es así, comentar ofreciendo colaboración en lugar de competir.
2. **Documentar** el alcance del stale code que se remueve.
3. **Asegurar** que no rompe funcionalidad existente con tests.

### 1.3 PR #194 — `fix(webview): rename roo→zoo prefix in diagnostics handler (#193)`
| Campo | Detalle |
|-------|---------|
| **Estado** | `REVIEW_REQUIRED` |
| **Creado** | 2026-05-19T06:49:11Z |
| **Última actualización** | 2026-05-19T20:42:36Z |
| **Vinculado a** | Issue #193 (nuestro issue) |
| **Prioridad** | 🟡 **MEDIA** — Fix de branding, bajo riesgo |

**⚡ Acción recomendada:**
1. **Comentar en el PR** con referencia directa al issue #193 y al análisis de contexto que ya proporcionamos.
2. **Ofrecer extensión** — mencionar que `.roo/rules-issue-fixer/` puede tener más remanentes `roo-` (como documentamos en #193).
3. **Este PR es de bajo riesgo** y debería ser fácil de mergear. Hacer follow-up semanal si no hay respuesta.

---

## 2. Issues Abiertas de `proyectoauraorg` — Seguimiento

### 2.1 Issue #193 — `[BUG] Diagnostic temp file still uses roo-diagnostics- prefix`
- **Nuestro PR #194** ya lo ataca directamente.
- **Acción:** Verificar que el PR esté linked al issue.

### 2.2 Issue #187 — `Context percentage bar shows inconsistent values`
- **Sin PR asociado** aún.
- **Prioridad:** 🟡 **MEDIA** — Afecta UX pero no es crítico.
- **Acción:** Crear PR para este issue después de resolver los 3 PRs abiertos.

---

## 3. Issues Abiertas del Repositorio — Oportunidades de Contribución

Basado en el análisis de ~50+ issues abiertas, estas son las **mejores oportunidades** alineadas con nuestra experiencia:

### 3.1 🔴 ALTA PRIORIDAD — Bugs que Podemos Resolver

| Issue | Título | Por qué podemos aportar |
|-------|--------|------------------------|
| **#201** | DeepSeek error: `reasoning_content` must be passed back | Ya tenemos experiencia con DeepSeek (PR #6 mergeado). Conocemos la API. |
| **#190** | anthropic `tool_use` blocks missing `tool_result` blocks | Bug crítico de Anthropic provider — podemos investigar el flujo de tool_use. |
| **#189** | Shift+Enter sends chat message instead of newline | Ya tenemos PR #202 abierto para esto. |
| **#188** | Revert does not work at all | Bug funcional — podemos investigar el mecanismo de revert. |
| **#192** | UI often disappears while using it | Reportado por múltiples usuarios, relacionado con sesiones largas. |
| **#186** | Grok 4.3 "Unable to apply diff" | Issue de parsing de diffs — podemos contribuir al diff handler. |

### 3.2 🟡 MEDIA PRIORIDAD — Enhancements Valiosos

| Issue | Título | Por qué es valioso |
|-------|--------|---------------------|
| **#191** | Clarify migration effects | Documentación — bajo esfuerzo, alto impacto para nuevos usuarios. |
| **#157** | Adjust font size in Zoo Code extension | Tiene discusión activa con solución CSS. Podemos implementar el setting. |
| **#171** | Auto-completion using Ollama models | Feature popular, alineado con roadmap de "Enhanced User Experience". |
| **#145** | Add AI commit message generation | Feature deseada por la comunidad, podemos implementar con providers existentes. |
| **#166** | Auto-expand code edits | UX improvement directo. |

### 3.3 🟢 BAJA PRIORIDAD — Para Contribuir a Largo Plazo

| Issue | Título | Nota |
|-------|--------|------|
| **#198** | Add GLM5.1, Deepseek 4 pro, Kimi 2.6 to fireworks.ai | Similar a nuestro PR #6 — agregar modelos. |
| **#156** | Remote Access: WebUI and Discord Bot Integration | Feature grande, requiere coordinación con equipo. |
| **#147** | New way to handle custom providers | Refactor arquitectónico significativo. |
| **#151** | Support LSP function | Enhancement de largo plazo. |

---

## 4. PRs Abiertos de Otros — Oportunidades de Feedback

Podemos aportar **code review constructivo** en estos PRs para ganar visibilidad:

| PR | Autor | Título | Acción |
|----|-------|--------|--------|
| **#81** | capitanfeeder | Add Xiaomi MiMo as first-class API provider | ¡Es nuestro! Verificar estado de review. |
| **#106** | doctarock | Extract checkpoint manager | Podemos review — refactor que afecta nuestra área (task management). |
| **#123** | edelauna | Merge Roo Code upstream sunset | PR importante — ofrecer testing. |
| **#159** | mojomast | Add portable CLI support packages | Review de arquitectura. |
| **#63** | taltas | Remove stale organizationMcps | Conflicto potencial con nuestro #196 — coordinar. |

---

## 5. Plan de Acción — Cronograma Recomendado

### 🗓️ FASE 1: Inmediata (Esta Semana — 19-25 Mayo)

| # | Acción | Prioridad | Tiempo estimado |
|---|--------|-----------|-----------------|
| 1 | **Rebasear PRs #202, #196, #194** sobre `main` actual | 🔴 | 30 min |
| 2 | **Comentar en PR #202** explicando nuestro enfoque vs PR #199 de roomote | 🔴 | 15 min |
| 3 | **Verificar conflicto** entre PR #196 y PR #63 (taltas) | 🔴 | 20 min |
| 4 | **Postular en Discord** a los issues #201 y #190 para "claiming" | 🔴 | 10 min |
| 5 | **Revisar PR #81** (MiMo provider) — verificar status de review | 🟡 | 15 min |

### 🗓️ FASE 2: Corto Plazo (Semana 2 — 26 Mayo al 1 Junio)

| # | Acción | Prioridad | Tiempo estimado |
|---|--------|-----------|-----------------|
| 6 | **Crear PR para Issue #187** (context percentage bar inconsistency) | 🟡 | 2-3 horas |
| 7 | **Investigar Issue #201** (DeepSeek reasoning_content) — crear fix PR | 🔴 | 3-4 horas |
| 8 | **Code review** de PRs #106, #123 para ganar visibilidad | 🟡 | 1 hora |
| 9 | **Follow-up** en PRs #202, #196, #194 si no hay respuesta | 🟡 | 30 min |

### 🗓️ FASE 3: Medio Plazo (Semana 3-4 — 2-15 Junio)

| # | Acción | Prioridad | Tiempo estimado |
|---|--------|-----------|-----------------|
| 10 | **Crear PR para Issue #191** (clarificar migración Roo→Zoo) | 🟡 | 2 horas |
| 11 | **Investigar Issue #190** (Anthropic tool_use) | 🟡 | 4-5 horas |
| 12 | **Implementar Issue #157** (font size setting) | 🟢 | 3-4 horas |
| 13 | **Crear PR para Issue #145** (AI commit messages) | 🟢 | 4-6 horas |

---

## 6. Estrategia de Enganche con el Equipo Zoo-Code

### 6.1 Reglas del CONTRIBUTING.md a Seguir

Según el CONTRIBUTING.md revisado:

1. **Issue-First:** Todo PR DEBE estar vinculado a un issue. Crear issue antes si no existe.
2. **Claiming:** Comentar "Claiming" en el issue y contactar al equipo en Discord.
3. **Draft PRs:** Usar Draft PRs para feedback temprano.
4. **Rebase:** Siempre rebasear sobre `main` antes de submitir.
5. **Tests:** Incluir tests (`npm test` debe pasar).
6. **Una PR por feature/fix:** No mezclar cambios.

### 6.2 Roadmap del Proyecto — Alineación

El roadmap de Zoo-Code prioriza:

| Área | Cómo nos alineamos |
|------|---------------------|
| **Reliability First** | Nuestros PRs #202 (Shift+Enter fix), #194 (diagnostics fix) directamente mejoran confiabilidad. |
| **Enhanced UX** | Issue #157 (font size), #166 (auto-expand), #145 (AI commits) mejoran UX. |
| **Agent Performance** | Podemos contribuir a evals/benchmarks en el futuro. |

### 6.3 Miembros Clave del Equipo

| Miembro | Rol | Interacciones previas |
|---------|-----|----------------------|
| **taltas** | Mantenedor | Aceptó PR #6, creó PR #63, dio feedback en PR #16 |
| **navedmerchant** | Colaborador activo | Comenta en issues, coordina PRs |
| **edelauna** | Colaborador | PR #123 (upstream merge), issues de testing |
| **kyr0** | Colaborador | Enhancement proposals activas (#164, #156) |

---

## 7. Gestión de Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| PRs no mergeados por falta de attention | Media | Follow-up semanal en Discord, rebase frecuente |
| Conflicto con PRs de roomote (bot) | Alta | Verificar si roomote PRs tienen prioridad automática, ofrecer nuestro PR como alternativa |
| Conflicto con PR #63 vs #196 | Alta | Coordinar con taltas directamente |
| Cambios en `main` que rompen nuestros PRs | Media | Rebasear semanalmente, mantener PRs pequeños y enfocados |
| Issue "claimed" por otro contributor | Baja | Verificar antes de empezar, comunicar en Discord |

---

## 8. Métricas de Éxito

| Métrica | Objetivo a 30 días |
|---------|---------------------|
| PRs mergeados (total) | **3-4** (actualmente 1) |
| PRs abiertos con review activo | **4-5** |
| Issues claimed y en progreso | **3-4** |
| Code reviews proporcionados | **5+** |
| Interacciones en Discord | **Semanal** |
| Miembros del equipo que nos reconocen | **4+** |

---

## 9. Resumen Ejecutivo del Plan

### Lo que ya tenemos:
- ✅ 1 PR mergeado (PR #6 — DeepSeek v4)
- ✅ 3 PRs abiertos (#202, #196, #194)
- ✅ 2 issues propias (#193, #187)
- ✅ Reputación inicial establecida con el equipo

### Lo que necesitamos hacer AHORA:
1. 🔥 Rebasear los 3 PRs abiertos sobre `main`
2. 🔥 Coordinar PR #196 vs PR #63 con taltas
3. 🔥 Posicionar PR #202 como alternativa superior a PR #199 de roomote
4. 🔥 Claim issues #201 y #190 en Discord

### Lo que haremos a corto plazo:
- 📋 Crear 2-3 PRs nuevos para bugs de alta prioridad
- 📋 Proporcionar code reviews en PRs de otros
- 📋 Crear PR para nuestro issue #187

### Visión a 30 días:
Convertirnos en uno de los **top 5 contributors** del proyecto con **3-4 PRs mergeados**, presencia activa en Discord, y relación de trabajo establecida con el equipo core.

---

*Informe generado automáticamente por Optimizador MiMo v2.5-pro — Xiaomi MiMo Team*
*Basado en auditoría completa del repositorio Zoo-Code-Org/Zoo-Code al 2026-05-19*
