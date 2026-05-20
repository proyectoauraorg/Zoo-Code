# 🗺️ ROADMAP MAESTRO — Proyecto Aura × Zoo-Code
## Documento Vivo — Clasificado por Fases

**Versión:** 1.0  
**Fecha:** 2026-05-19  
**Autor:** MiMo-v2.5-pro (Issue Investigator)  
**Para:** Dr. Armando Vaquera — Proyecto Aura  
**Repositorios:** `proyectoauraorg/Zoo-Code` (fork) ↔ `Zoo-Code-Org/Zoo-Code` (upstream)  

---

## 📋 ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estado Actual Consolidado](#2-estado-actual-consolidado)
3. [FASE 0 — Respuesta Inmediata (0-48h)](#3-fase-0--respuesta-inmediata-0-48h)
4. [FASE 1 — Consolidación (Semana 1)](#4-fase-1--consolidación-semana-1)
5. [FASE 2 — Expansión (Semanas 2-3)](#5-fase-2--expansión-semanas-2-3)
6. [FASE 3 — Posicionamiento (Semanas 4-8)](#6-fase-3--posicionamiento-semanas-4-8)
7. [Plan de Respuesta por PR/Issue](#7-plan-de-respuesta-por-prissue)
8. [Gobernanza del Fork (`proyectoauraorg`)](#8-gobernanza-del-fork-proyectoauraorg)
9. [Gestión de Riesgos](#9-gestión-de-riesgos)
10. [Métricas y Hitos](#10-métricas-y-hitos)
11. [Cronograma Visual](#11-cronograma-visual)
12. [Apéndices](#12-apéndices)

---

## 1. Resumen Ejecutivo

### 🎯 Misión
Posicionar a Proyecto Aura como uno de los **top 5 contributors** del proyecto Zoo-Code dentro de 30 días, con al menos **3-4 PRs mergeados**, presencia activa en Discord, y relación de trabajo sólida con el equipo core.

### 📊 Snapshot Actual

| Dimensión | Estado | Detalle |
|-----------|--------|---------|
| **PR mergeados (upstream)** | 1 | PR #6 — DeepSeek v4 static support |
| **PRs abiertos (upstream)** | 6 | #81, #193, #194, #195, #196, #202 |
| **PRs en fork propio** | 4 | #1, #2, #4, #5 (proyectoauraorg) |
| **Issues creadas** | 2 | #193, #187 |
| **Tasa de aceptación** | 12.5% | 1/8 mergeados (baja por tiempo de review) |
| **Reputación con equipo** | ✅ Positiva | Feedback constructivo, respuestas rápidas |
| **Fork: seguridad** | ✅ Resuelto | .gitconfig eliminado, Dependabot habilitado, ramas protegidas |
| **Fork: visibilidad** | ✅ Mejorado | Topics, descripción y Discussions habilitados |

### ⚠️ Alertas Críticas

1. **PR #81 (MiMo)** — 8 comentarios pendientes de edelauna SIN RESPUESTA (desde 2026-05-18)
2. **PR #202** — navedmerchant pidió remover CONTRIBUTIONS.md — REQUIERE ACCIÓN
3. **PRs #194, #196** — Posible duplicación con PRs existentes de otros contributors
4. **Rebase necesario** — 8 de 10 branches locales están detrás de `main`

---

## 2. Estado Actual Consolidado

### 2.1 PRs en Upstream (Zoo-Code-Org/Zoo-Code)

| PR | Título | Estado | Reviewer | Acción Requerida | Urgencia |
|----|--------|--------|----------|------------------|----------|
| **#81** | feat: add MiMo provider | 🔄 Abierto | taltas, edelauna | Responder 8 comentarios de edelauna | 🔴 ALTA |
| **#193** | fix: diagnostic temp file prefix | 🔄 Abierto | — | Esperar review / rebasear | 🟡 MEDIA |
| **#194** | feat: YAML duplicate key detection | 🔄 Abierto | navedmerchant | Aclarar si es duplicado de #199 | 🟡 MEDIA |
| **#195** | fix: variable reference fix | 🔄 Abierto | — | Esperar review / rebasear | 🟢 BAJA |
| **#196** | feat: symbol-based detection | 🔄 Abierto | — | Coordinar con PR #63 de allquixotic | 🟡 MEDIA |
| **#202** | fix: Shift+Enter newline (#199) | 🔄 Abierto | navedmerchant | Remover CONTRIBUTIONS.md, aclarar relación con #199 | 🔴 ALTA |
| **#6** | feat: DeepSeek v4 static support | ✅ Mergeado | taltas | Ninguna | ✅ |
| **#16** | feat: DeepSeek dynamic fetching | ❌ Cerrado | taltas | Reabrir como PR separado si se desea | 🟢 BAJA |

### 2.2 PRs en Fork (proyectoauraorg/Zoo-Code)

| PR | Título | Estado | Acción Requerida | Urgencia |
|----|--------|--------|------------------|----------|
| **#1** | fix(i18n): Roo→Zoo brand consistency | ⏳ Pendiente merge | Resolver conflictos + rebasear | 🟡 MEDIA |
| **#2** | feat: migrate User-Agent to ZooCode | ⏳ Pendiente merge | Resolver conflictos + rebasear | 🟡 MEDIA |
| **#4** | chore(deps): bump ws 8.18.2→8.20.1 | ⏳ Pendiente merge (Dependabot) | Merge automático cuando CI pase | 🟢 BAJA |
| **#5** | ci: add Dependabot configuration | ⏳ Pendiente merge | Merge con 2 approvals | 🟡 MEDIA |

### 2.3 Issues Propias

| Issue | Título | Estado | PR Vinculado |
|-------|--------|--------|--------------|
| **#193** | Diagnostic temp file prefix | 🔄 Abierta | PR #193 |
| **#187** | Context percentage bar inconsistency | 🔄 Abierta | (sin PR aún) |

### 2.4 Branches Locales

| Branch | Ahead/Behind | Estado | PR Asociado |
|--------|-------------|--------|-------------|
| `fix/i18n-roo-to-zoo-brand-consistency` | +2/-0 | ✅ Listo | Fork PR #1 |
| `feat/user-agent-migration` | +1/-1 | ⚠️ Rebase | Fork PR #2 |
| `fix/199-shift-enter-newline` | +1/-0 | ✅ Listo | Upstream PR #202 |
| `fix/193-diagnostic-prefix-rename` | +1/-1 | ⚠️ Rebase | Upstream PR #193 |
| `feat/80-mimo-models-integration` | +1/-1 | ⚠️ Rebase | Upstream PR #81 |
| `refactor/62-remove-stale-organizationMcps` | +1/-1 | ⚠️ Rebase | Upstream PR #196 |
| `feat/157-configurable-font-size` | +0/-1 | ⚠️ Rebase | (sin PR) |
| `feature/font-size-setting` | +2/-1 | ⚠️ Rebase | (sin PR) |
| `fix/user-agent-roo-to-zoo-migration` | +0/-1 | ⚠️ Rebase | (duplicado de feat/user-agent) |
| `fix/i18n-roo-to-zoo-operational-strings` | +0/-0 | ✅ Sync | (sin PR) |

---

## 3. FASE 0 — Respuesta Inmediata (0-48h)

> **Objetivo:** Cerrar interacciones abiertas que dañan nuestra reputación y evitar malentendidos.

### 🔴 Acción 0.1 — Responder a edelauna en PR #81 (MiMo Provider)
**Prioridad:** CRÍTICA  
**Deadline:** 2026-05-20 (hoy)  
**Responsable:** Dr. Vaquera / MiMo  

edelauna dejó **8 comentarios detallados** el 2026-05-18 que no tienen respuesta. Esto proyecta negligencia. Cada comentario requiere:

| # | Comentario de edelauna | Tipo | Respuesta Sugerida |
|---|----------------------|------|--------------------|
| 1 | `sanitizeOpenAiCallId` import removido pero import quedó | Bug fix | Agradecer, remover import huérfano, push fix |
| 2 | Edge case: assistant messages con reasoning_details | Enhancement | Implementar guard clause, push fix |
| 3 | Inconsistencia en i18n (japonés vs otros) | Bug fix | Corregir archivo ja.json, push fix |
| 4 | mimo-v2-flash no listado en modelos soportados | Enhancement | Agregar al enum de modelos, push fix |
| 5 | Traducciones francesas incompletas | Bug fix | Completar fr.json, push fix |
| 6 | environment_details en Task.ts | Enhancement | Evaluar y responder con plan |
| 7 | Tests insuficientes para edge cases | Enhancement | Agregar test cases, push fix |
| 8 | Consistencia de API con otros providers | Enhancement | Revisar y alinear, push fix |

**Formato de respuesta:** Agradecer cada comentario, indicar qué se hizo, y hacer push de los cambios.

### 🔴 Acción 0.2 — Resolver situación de PR #202
**Prioridad:** CRÍTICA  
**Deadline:** 2026-05-20 (hoy)  

navedmerchant pidió: *"Can you remove this .md file? We do not need markdown on the contributions."*

**Plan:**
1. Hacer force-push al branch `fix/199-shift-enter-newline` SIN el archivo CONTRIBUTIONS.md
2. Comentar en PR #202: *"Done. Removed CONTRIBUTIONS.md. The PR now only contains the fix for #199 (ChatTextArea.tsx + spec)."*
3. Verificar que el PR solo contenga los 2 archivos relevantes

### 🟡 Acción 0.3 — Aclarar PR #194 vs #199
**Prioridad:** ALTA  
**Deadline:** 2026-05-21  

navedmerchant sugirió que #194 podría ser duplicado de #199. Los títulos son diferentes pero hay confusión.

**Plan:**
1. Comentar en PR #194: *"To clarify: this PR adds YAML duplicate key detection, which is a different concern from #199 (Shift+Enter behavior). They address different issues."*
2. Si navedmerchant insiste, evaluar si cerrar #194 es la mejor estrategia

---

## 4. FASE 1 — Consolidación (Semana 1: 2026-05-20 al 2026-05-26)

> **Objetivo:** Limpiar PRs abiertos, rebasear branches, y establecer presencia activa.

### 🟡 Acción 1.1 — Rebasear todos los branches
**Prioridad:** ALTA  
**Deadline:** 2026-05-22  

```bash
# Script de rebase masivo
for branch in feat/user-agent-migration fix/193-diagnostic-prefix-rename \
               feat/80-mimo-models-integration refactor/62-remove-stale-organizationMcps \
               feat/157-configurable-font-size feature/font-size-setting \
               fix/user-agent-roo-to-zoo-migration; do
  git checkout $branch
  git rebase main
  # Resolver conflictos si existen
  git push origin $branch --force-with-lease
done
```

### 🟡 Acción 1.2 — Merge de PRs internos del fork
**Prioridad:** ALTA  
**Deadline:** 2026-05-23  

| PR | Acción | Razón |
|----|--------|-------|
| #5 (Dependabot config) | ✅ Merge | Necesario para seguridad automatizada |
| #4 (ws bump) | ✅ Merge | Seguridad — vulnerabilidad en ws |
| #1 (i18n Roo→Zoo) | ⏸️ Evaluar | Revisar si upstream ya hizo estos cambios |
| #2 (User-Agent migration) | ⏸️ Evaluar | Revisar si upstream ya hizo estos cambios |

### 🟡 Acción 1.3 — Crear PR para Issue #187
**Prioridad:** MEDIA  
**Deadline:** 2026-05-25  

Issue #187 documenta un bug real en la barra de porcentaje de contexto. Crear un PR que:
1. Unifique el mecanismo de conteo de tokens
2. Muestre un valor consistente en la UI
3. Incluya tests

### 🟢 Acción 1.4 — Claim Issues en Discord
**Prioridad:** MEDIA  
**Deadline:** 2026-05-24  

Issues sugeridos para claim:
- **#201** — Bug con environment_details en Task.ts (relacionado con PR #81)
- **#190** — Verificar si es relevante y claimable

**Mensaje sugerido para Discord:**
> *"Hi team! I'd like to claim #201 — I've already been working on the environment_details issue as part of PR #81. Happy to tackle it as a standalone fix if preferred."*

---

## 5. FASE 2 — Expansión (Semanas 2-3: 2026-05-27 al 2026-06-09)

> **Objetivo:** Crear nuevos PRs de alto valor, proporcionar code reviews, y construir capital social.

### 📋 Acción 2.1 — Crear PR para i18n Roo→Zoo (Upstream)
**Prioridad:** ALTA  
**Deadline:** 2026-05-28  

Branch `fix/i18n-roo-to-zoo-brand-consistency` ya está listo. Crear PR en upstream:
- Título: `fix(i18n): replace stale 'Roo' references with 'Zoo' across all locale files`
- 57 archivos de idioma, reemplazos de cadenas
- Riesgo bajo, impacto alto en identidad de marca

### 📋 Acción 2.2 — Crear PR para User-Agent Migration (Upstream)
**Prioridad:** ALTA  
**Deadline:** 2026-05-29  

Branch `feat/user-agent-migration` listo después de rebase:
- Título: `feat: migrate User-Agent and API headers from Roo-Cline to Zoo-Code`
- 7 archivos, headers de proveedores
- Riesgo bajo, impacto alto en branding ante proveedores API

### 📋 Acción 2.3 — Proporcionar Code Reviews
**Prioridad:** ALTA  
**Deadline:** Continuo (mínimo 3 por semana)  

Revisar PRs de otros contributors para construir capital social:
- Buscar PRs etiquetados como "good first issue" o "help wanted"
- Dar feedback constructivo y técnico
- Priorizar PRs de taltas, edelauna y otros mantenedores

### 📋 Acción 2.4 — Evaluar PR #16 (Dynamic Fetching) como PR Separado
**Prioridad:** MEDIA  
**Deadline:** 2026-06-01  

taltas cerró PR #16 sugiriendo que el fetching dinámico debería ser un PR separado de #6. Evaluar:
- ¿Vale la pena reabrir como PR independiente?
- ¿El código sigue siendo relevante?
- Si sí, crear branch limpio y nuevo PR

---

## 6. FASE 3 — Posicionamiento (Semanas 4-8: 2026-06-10 al 2026-07-07)

> **Objetivo:** Consolidar posición como top contributor, escalar participación.

### 🎯 Acción 3.1 — Migrar Fork a GitHub Organization
**Prioridad:** MEDIA  
**Deadline:** 2026-06-15  

Documento preparado: `docs/MIGRACION_GITHUB_ORG.md`
- Beneficios: branch protection con required reviews, CODEOWNERS funcional
- Prerequisito: GitHub for Nonprofits approval

### 🎯 Acción 3.2 — Aplicar a GitHub for Nonprofits
**Prioridad:** MEDIA  
**Deadline:** 2026-06-20  

Documento preparado: `docs/GITHUB_FOR_NONPROFITS.md`
- GitHub Team gratis (ilimitado)
- GitHub Copilot Business gratis
- GitHub Advanced Security

### 🎯 Acción 3.3 — Desarrollar Feature Completa
**Prioridad:** ALTA  
**Deadline:** 2026-07-07  

Identificar una feature del roadmap de Zoo-Code y desarrollarla completamente:
- Evaluar el roadmap del proyecto (CONTRIBUTING.md menciona reliability, UX, agent performance)
- Proponer en Discord/Issues
- Desarrollar con tests completos, documentación, y i18n

---

## 7. Plan de Respuesta por PR/Issue

### 7.1 PR #81 — MiMo Provider (EL MÁS CRÍTICO)

```
ESTADO:  🔄 Abierto desde 2026-05-12 (7 días)
RIESGO:  Alto — 8 comentarios sin respuesta proyectan negligencia
PLAN:
  ├── 1. Responder CADA comentario de edelauna (hoy)
  │     ├── Agradecer feedback
  │     ├── Implementar cambios solicitados
  │     └── Push de fixes
  ├── 2. Responder comentarios de taltas (5 pendientes)
  │     ├── Verificar que las respuestas anteriores siguen vigentes
  │     └── Implementar cambios adicionales si se solicitaron
  ├── 3. Revisar feedback de CodeRabbit
  │     ├── Issues: assistant messages, reasoning_details
  │     ├── Issues: Japanese inconsistency
  │     └── Issues: mimo-v2-flash, French translations
  └── 4. Rebasear sobre main actual
        └── Resolver conflictos si existen
```

### 7.2 PR #202 — Shift+Enter Fix

```
ESTADO:  🔄 Abierto desde 2026-05-19
RIESGO:  Medio — CONTRIBUTIONS.md ofende a navedmerchant
PLAN:
  ├── 1. Remover CONTRIBUTIONS.md del PR (hoy)
  ├── 2. Verificar que solo contenga ChatTextArea.tsx + spec
  ├── 3. Comentar confirmando el cambio
  └── 4. Posicionar como alternativa a PR #199 de roomote
        └── "This is a minimal, focused fix — only 2 files changed"
```

### 7.3 PR #194 — YAML Duplicate Key Detection

```
ESTADO:  🔄 Abierto desde 2026-05-19
RIESGO:  Medio — posible duplicado según navedmerchant
PLAN:
  ├── 1. Aclarar diferencia con PR #199
  ├── 2. Si se cierra: agradecer y no insistir
  └── 3. Si se mantiene: rebasear y esperar review
```

### 7.4 PR #196 — Symbol-based Detection

```
ESTADO:  🔄 Abierto desde 2026-05-19
RIESGO:  Medio — posible conflicto con PR #63 de allquixotic
PLAN:
  ├── 1. Verificar si PR #63 está mergeado o cerrado
  ├── 2. Si mergeado: evaluar si #196 es redundante
  ├── 3. Si abierto: coordinar con allquixotic
  └── 4. Si cerrado: #196 puede proceder independientemente
```

### 7.5 PR #193 — Diagnostic Prefix

```
ESTADO:  🔄 Abierto desde 2026-05-19
RIESGO:  Bajo — bug fix simple
PLAN:
  ├── 1. Rebasear sobre main
  ├── 2. Esperar review
  └── 3. Follow-up en Discord si no hay review en 1 semana
```

### 7.6 PR #195 — Variable Reference Fix

```
ESTADO:  🔄 Abierto desde 2026-05-19
RIESGO:  Bajo — fix simple
PLAN:
  ├── 1. Rebasear sobre main
  ├── 2. Esperar review
  └── 3. Follow-up en Discord si no hay review en 1 semana
```

### 7.7 Issues #193 y #187

```
#193: Diagnostic prefix — PR #193 ya creado, solo necesita merge
#187: Context percentage bar — SIN PR aún
PLAN para #187:
  ├── 1. Investigar root cause (dual token counting)
  ├── 2. Desarrollar fix
  ├── 3. Crear PR con tests
  └── 4. Vincular a issue #187
```

---

## 8. Gobernanza del Fork (`proyectoauraorg`)

### 8.1 Seguridad — ✅ COMPLETADO

| Hallazgo | Estado | Evidencia |
|----------|--------|-----------|
| .gitconfig expuesto | ✅ Eliminado | HTTP 404 |
| Dependabot deshabilitado | ✅ Habilitado | PR #4 creado |
| Sin protección de ramas | ✅ Configurado | 2 approvals + enforce admins |
| CODEOWNERS sin acceso | ✅ Actualizado | @proyectoauraorg @KarlaCaballero09 |
| Topics vacíos | ✅ 14 topics | Visibilidad mejorada |
| Discussions deshabilitado | ✅ Habilitado | Canal abierto |

### 8.2 Pendientes del Fork

| Item | Estado | Nota |
|------|--------|------|
| dependabot.yml | ⏳ PR #5 pendiente | Requiere merge con 2 approvals |
| Migración a Organization | 📄 Documento preparado | `docs/MIGRACION_GITHUB_ORG.md` |
| GitHub for Nonprofits | 📄 Documento preparado | `docs/GITHUB_FOR_NONPROFITS.md` |

### 8.3 Norma Lingüística

| Contexto | Idioma | Ejemplo |
|----------|--------|---------|
| Fork interno (proyectoauraorg) | 🇪🇸 Español | Commits, ramas, documentación interna |
| Upstream (Zoo-Code-Org) | 🇬🇧 Inglés | PRs, Issues, comentarios públicos |

---

## 9. Gestión de Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| PR #81 rechazado por falta de respuesta | Alta | Alto | Responder HOY a todos los comentarios |
| PR #202 cerrado por CONTRIBUTIONS.md | Alta | Medio | Remover archivo HOY |
| PRs de roomote tienen prioridad | Media | Medio | Posicionar nuestros PRs como alternativas superiores |
| Conflictos con PRs de allquixotic | Media | Medio | Coordinar directamente en Discord |
| Cambios en `main` rompen nuestros PRs | Media | Bajo | Rebasear semanalmente |
| Nuestros PRs ignorados por falta de visibilidad | Media | Medio | Follow-up en Discord, code reviews de otros |
| Rate limiting de CodeRabbit retrasa reviews | Baja | Bajo | Nada que hacer, solo esperar |

---

## 10. Métricas y Hitos

### 10.1 Métricas a Monitorear (Semanal)

| Métrica | Actual (2026-05-19) | Meta Semana 1 | Meta Semana 4 | Meta Semana 8 |
|---------|---------------------|---------------|---------------|---------------|
| PRs mergeados (upstream) | 1 | 1 | 3 | 5 |
| PRs abiertos con review activo | 6 | 6 | 4 | 3 |
| Issues propias | 2 | 2 | 3 | 5 |
| Code reviews dados | 0 | 2 | 8 | 20 |
| Comentarios en Discord | 0 | 3 | 10 | 30 |
| Miembros del equipo que nos reconocen | 2 (taltas, navedmerchant) | 3 | 4 | 6 |

### 10.2 Hitos Clave

| # | Hito | Fecha Target | Dependencia |
|---|------|-------------|-------------|
| H1 | Responder TODOS los comentarios de PR #81 | 2026-05-20 | — |
| H2 | Limpiar PR #202 (remover CONTRIBUTIONS.md) | 2026-05-20 | — |
| H3 | Rebasear todos los branches | 2026-05-22 | — |
| H4 | Merge de PRs internos del fork | 2026-05-23 | H3 |
| H5 | Claim 1-2 issues en Discord | 2026-05-24 | — |
| H6 | Crear PR para Issue #187 | 2026-05-25 | — |
| H7 | PR #81 mergeado | 2026-05-26 | H1 |
| H8 | Crear PR upstream para i18n Roo→Zoo | 2026-05-28 | H3 |
| H9 | Crear PR upstream para User-Agent migration | 2026-05-29 | H3 |
| H10 | 3 PRs mergeados en upstream | 2026-06-09 | H7, H8, H9 |
| H11 | Migrar a GitHub Organization | 2026-06-15 | — |
| H12 | Top 5 contributor | 2026-07-07 | H10 |

---

## 11. Cronograma Visual

```
SEMANA 0 (HOY)
├── 🔴 Responder edelauna (PR #81)
├── 🔴 Limpiar PR #202
└── 🟡 Aclarar PR #194 vs #199

SEMANA 1 (20-26 MAY)
├── 🟡 Rebasear todos los branches
├── 🟡 Merge PRs internos del fork
├── 🟡 Claim issues en Discord
├── 🟢 Crear PR para Issue #187
└── 🎯 HITO: PR #81 mergeado

SEMANA 2 (27 MAY - 2 JUN)
├── 🟡 Crear PR upstream: i18n Roo→Zoo
├── 🟡 Crear PR upstream: User-Agent migration
├── 🟢 Code reviews de otros PRs
└── 🟢 Follow-up en Discord

SEMANA 3 (3-9 JUN)
├── 🟢 Evaluar PR #16 como separado
├── 🟢 Code reviews continuos
└── 🎯 HITO: 3 PRs mergeados

SEMANAS 4-8 (10 JUN - 7 JUL)
├── 🟢 Migrar a GitHub Organization
├── 🟢 Aplicar a GitHub for Nonprofits
├── 🟢 Desarrollar feature completa
└── 🎯 HITO: Top 5 contributor
```

---

## 12. Apéndices

### A. Documentos Fuente

| Documento | Contenido | Ubicación |
|-----------|-----------|-----------|
| Informe de Historial | PRs, Issues, interacciones con equipo | `informe-historial-interacciones-proyectoauraorg.md` |
| Auditoría Integral | Seguridad, gobernanza del fork | `AUDITORIA_INTEGRAL_PROYECTOAURAORG.md` |
| Informe Zoo-Code | Estado del repo upstream | `INFORME_ZOO_CODE_2026-05-19.md` |
| Plan de Acción Estratégico | Plan original de 30 días | `plan-accion-estrategico-zoocode.md` |
| CONTRIBUTIONS.md | Registro de branches y PRs | `CONTRIBUTIONS.md` |
| progress.txt | Progreso de cherry-picks (Roo Code) | `progress.txt` |

### B. Contactos del Equipo Zoo-Code

| Miembro | Rol | Patrón de Feedback |
|---------|-----|--------------------|
| **taltas** | Mantenedor principal | Prefiere PRs enfocados, scope limitado |
| **edelauna** | Revisor técnico | Muy detallado, edge cases, consistencia API |
| **navedmerchant** | Colaborador/Revisor | Breve, cuestiona duplicados |
| **doctarock** | Colaborador | Contexto y mediación |

### C. Comandos Útiles

```bash
# Sincronizar con upstream
git fetch upstream
git merge upstream/main

# Rebasear un branch
git checkout <branch>
git rebase main
git push origin <branch> --force-with-lease

# Crear PR vía GitHub CLI
gh pr create --base main --head <branch> --title "..." --body "..."

# Verificar sincronización
git log --oneline upstream/main..origin/main
```

---

*Documento generado por MiMo-v2.5-pro — Issue Investigator Mode*  
*Para: Dr. Armando Vaquera — Proyecto Aura*  
*Versión: 1.0 | Fecha: 2026-05-19*  
*Este es un documento vivo — actualizar conforme avance el trabajo*
