# Registro de Contribuciones — Zoo-Code
## Dr. Armando Vaquera — Proyecto Aura

**Fecha:** 2026-05-19
**Fork:** `proyectoauraorg/Zoo-Code` (origin) / `Zoo-Code-Org/Zoo-Code` (upstream)
**Ruta local:** `/Users/dr.armandovaquera/Zoo-Code-contrib`

---

## 🔤 Norma Lingüística del Proyecto

### Repositorio Fork (`proyectoauraorg/Zoo-Code`) → 🇪🇸 **Español**
- Documentación interna, comunicaciones entre colaboradores
- Mensajes de commit, nombres de ramas
- Registros en CONTRIBUTIONS.md, notas de desarrollo
- Todo contenido generado dentro de este repositorio

### Repositorio Upstream (`Zoo-Code-Org/Zoo-Code`) → 🇬🇧 **Inglés**
- Pull Requests, Issues, comentarios en reviews
- Descripciones de cambios, títulos, cuerpos de mensajes
- Cualquier comunicación pública hacia la comunidad upstream

> Esta separación lingüística asegura identidad organizativa interna
> y máxima accesibilidad para la comunidad internacional.

---

## Resumen de Contribuciones

| # | Branch | Status | Type | Description |
|---|--------|--------|------|-------------|
| 1 | `fix/i18n-roo-to-zoo-brand-consistency` | ✅ Listo | Bug fix (i18n) | Reemplazar referencias "Roo" obsoletas con "Zoo" en archivos de idioma |
| 2 | `feat/user-agent-migration` | ✅ Listo | Mejora (branding) | Migrar User-Agent headers de Roo-Cline a Zoo-Code |
| 3 | `fix/global-font-size` | ⏸️ Diferido | Mejora (UX) | Normalización global de tamaño de fuente — demasiado invasivo, sin issue |
| 4 | `fix/199-shift-enter-newline` | ✅ PR creado | Bug fix (UX) | Shift+Enter inserta nueva línea en vez de enviar mensaje vacío (Fixes #199) |

---

## PR #1: Corrección i18n — Consistencia de Marca "Roo" → "Zoo"

**Branch:** `fix/i18n-roo-to-zoo-brand-consistency`
**Commits:** 2 (sobre main, incluye e2e unskip de upstream)
**Archivos:** 63 (57 archivos de idioma + 6 archivos e2e de upstream)
**Riesgo:** Bajo — reemplazos de cadenas en archivos JSON de localización

### Alcance de Cambios

**Locales backend** (`src/i18n/locales/*/common.json`) — 18 archivos:
- ca, de, en, es, fr, hi, id, it, ja, ko, nl, pl, pt-BR, ru, tr, vi, zh-CN, zh-TW

**Locales frontend** (`webview-ui/src/i18n/locales/*/`) — 39 archivos:
- `chat.json` (16 idiomas)
- `settings.json` (16 idiomas)
- `prompts.json` (de, ja, ko, zh-CN)
- `mcp.json` (ja, ko)

### Ejemplo de Reemplazos

```json
// Antes
"welcomeTitle": "Welcome to Roo-Code"
"marketplaceTitle": "Roo-Code Marketplace"

// Después
"welcomeTitle": "Welcome to Zoo-Code"
"marketplaceTitle": "Zoo-Code Marketplace"
```

### ¿Por Qué Importa?
Estas son las cadenas más visibles para el usuario: pantalla de bienvenida, encabezado del marketplace, descripciones de configuración, prompts de chat y etiquetas de herramientas MCP. La migración incompleta crea una experiencia de marca híbrida confusa.

---

## PR #2: Migrar User-Agent de Roo-Cline a Zoo-Code

**Branch:** `feat/user-agent-migration`
**Commits:** 1
**Archivos:** 7
**Riesgo:** Bajo — reemplazos de cadenas en headers de proveedores y tests

### Archivos Modificados

| Archivo | Cambios |
|------|---------|
| `src/api/providers/constants.ts` | `RooCode/` → `ZooCode/`, URL `Roo-Cline` → `Zoo-Code`, `Roo Code` → `Zoo Code` |
| `src/api/providers/bedrock.ts` | `RooCode#` → `ZooCode#` en `userAgentAppId` |
| `src/api/providers/openai-codex.ts` | `roo-code` → `zoo-code` en originator + User-Agent (×3 ubicaciones) |
| `src/api/providers/openai-native.ts` | `Roo Code` → `Zoo Code` en header X-Title (×3 ubicaciones) |
| `src/core/task/Task.ts` | `RooCode#` → `ZooCode#` en identificadores de eventos (×5 ubicaciones) |
| `src/services/code-index/embedders/bedrock.ts` | `RooCode#` → `ZooCode#` en userAgentAppId |
| `apps/cli/.../cancellation.test.ts` | `RooCode#say` → `ZooCode#say` en aserción de test |

### ¿Por Qué Importa?
Los User-Agent headers se envían a cada proveedor de API (Anthropic, OpenAI, AWS Bedrock, etc.). Identifican la aplicación cliente. Tener "Roo-Cline" en headers de producción:
1. Presenta incorrectamente la aplicación ante proveedores de API
2. Crea confusión en analítica/monitoreo de proveedores
3. Es inconsistente con el campo `publisher` de `package.json` (`zoo-code`)

---

## PR #3: Tamaño de Fuente Global (Diferido)

**Estado:** ⏸️ No implementado
**Razón:** Alta invasividad (76+ archivos), sin issue en GitHub, baja prioridad

### Hallazgos
- El contenido principal del chat (`MarkdownBlock.tsx`) ya usa `var(--vscode-font-size)` ✅
- Existen propiedades CSS personalizadas en `index.css` (`--text-xs`, `--text-sm`, etc.)
- **76+ ubicaciones** en `webview-ui/src/components/` tienen valores de `fontSize` en píxeles hardcodeados
- Migrar todos los estilos inline a variables CSS sería un refactor grande con riesgo de regresión visual

### Recomendación
Si se desea en el futuro, implementar en fases:
1. Paneles de Configuración/MCP/Marketplace (menor riesgo)
2. Componentes de UI de Chat (mayor visibilidad)
3. Eliminar todos los tamaños de fuente hardcodeados inline

---

## PR #4: Fix #199 — Shift+Enter Inserta Nueva Línea en Modo Newline

**PR:** [#202](https://github.com/Zoo-Code-Org/Zoo-Code/pull/202) (abierto)
**Branch:** `fix/199-shift-enter-newline`
**Issue:** [#199](https://github.com/Zoo-Code-Org/Zoo-Code/issues/199)
**Commits:** 1
**Archivos:** 2 (`ChatTextArea.tsx` + `ChatTextArea.spec.tsx`)
**Riesgo:** Bajo — cambio de 1 línea lógica + actualización de test

### El Problema

En el modo de comportamiento de Enter configurado como `newline`, Shift+Enter enviaba un mensaje vacío en lugar de insertar una nueva línea. La condición original incluía `event.shiftKey` junto con `ctrlKey` y `metaKey` como combinaciones de envío:

```typescript
// ANTES (incorrecto)
if (event.shiftKey || event.ctrlKey || event.metaKey) {
  event.preventDefault()
  onSend()
}
```

### La Solución

Remover `event.shiftKey` de la condición. Solo Ctrl/Cmd+Enter envían mensajes en modo newline:

```typescript
// DESPUÉS (correcto)
if (event.ctrlKey || event.metaKey) {
  event.preventDefault()
  onSend()
}
```

### Comportamiento Corregido

| Tecla | Modo `submit` (default) | Modo `newline` |
|-------|--------------------------|----------------|
| Enter | Enviar mensaje | Nueva línea |
| Shift+Enter | Nueva línea | Nueva línea ✅ (antes enviaba) |
| Ctrl/Cmd+Enter | Enviar mensaje | Enviar mensaje |

---

## Estado de Sincronización con Upstream

**Última sincronización:** 2026-05-19 20:08 CST
**Commit local:** `7de61e6f9` — [Chore] Unskip VS Code e2e replay for use_mcp_tool (#93)
**Diferencia con upstream:** 0 commits (✅ sincronizado)
**Tipo de merge:** Fast-forward (sin conflictos)

### Estado de Branches Locales

| Branch | +Ahead / -Behind vs main | Estado |
|--------|--------------------------|--------|
| `feat/157-configurable-font-size` | +0/-1 | ✅ Necesita rebase |
| `feat/80-mimo-models-integration` | +1/-1 | ✅ Necesita rebase |
| `feat/user-agent-migration` | +1/-1 | ✅ Necesita rebase |
| `feature/font-size-setting` | +2/-1 | ✅ Necesita rebase |
| `fix/193-diagnostic-prefix-rename` | +1/-1 | ✅ Necesita rebase |
| `fix/199-shift-enter-newline` | +1/-0 | ✅ PR #202 creado |
| `fix/i18n-roo-to-zoo-brand-consistency` | +2/-0 | ✅ Listo para PR |
| `fix/i18n-roo-to-zoo-operational-strings` | +0/-0 | ✅ Sincronizado |
| `fix/user-agent-roo-to-zoo-migration` | +0/-1 | ✅ Necesita rebase |
| `refactor/62-remove-stale-organizationMcps` | +1/-1 | ✅ Necesita rebase |

### Nota sobre PR #194 de Upstream

PR #194 (`doc-api-refactor`) es el PR más activo en upstream que propone:
- Nueva estructura `docs/modules/` con diagramas Mermaid
- Integración con `ApiDocBuilder` (Supabase/OpenAI)
- 9 módulos de documentación + scripts de generación
- **Estado:** Abierto, revisión solicitada a `@mfreer-aura`

---

## Flujo de Trabajo Git

```bash
# Branches están listos localmente
git branch -v
# * main                                  7de61e6f9 [Chore] Unskip VS Code e2e replay for use_mcp_tool (#93)
#   fix/i18n-roo-to-zoo-brand-consistency 87f959f52 fix(i18n): replace stale 'Roo' references...
#   feat/user-agent-migration             cce887a91 feat: migrate RooCode# identifiers to ZooCode#...

# Para sincronizar con upstream:
git fetch upstream
git merge upstream/main  # Fast-forward cuando no hay divergencia

# Para push y crear PRs (requiere acceso de push a origin):
git push origin fix/i18n-roo-to-zoo-brand-consistency
git push origin feat/user-agent-migration

# Crear PRs vía GitHub CLI:
gh pr create --base main \
  --head fix/i18n-roo-to-zoo-brand-consistency \
  --title "fix(i18n): replace stale 'Roo' references with 'Zoo' across all locale files" \
  --body "Completa la migración de marca Roo→Zoo en los 57 archivos JSON de localización..."

gh pr create --base main \
  --head feat/user-agent-migration \
  --title "feat: migrate User-Agent and API headers from Roo-Cline to Zoo-Code" \
  --body "Actualiza User-Agent headers, HTTP-Referer y X-Title en todos los proveedores..."
```

---

## Comandos de Verificación

```bash
# Verificar que no queden "Roo" en locales
grep -r '"Roo' src/i18n/locales/ webview-ui/src/i18n/locales/ --include="*.json" | grep -v node_modules

# Verificar que no queden RooCode en proveedores
grep -r 'RooCode\|Roo-Cline\|roo-code' src/api/ src/core/task/ src/services/ --include="*.ts"

# Validar archivos JSON
for f in src/i18n/locales/*/common.json; do python3 -c "import json; json.load(open('$f'))" && echo "OK: $f"; done

# Verificar sincronización con upstream
git fetch upstream && git log --oneline upstream/main..origin/main  # Debe estar vacío
```

---

## Próximos Pasos

1. **Hacer push de branches** a GitHub (requiere acceso de push a origin)
2. **Crear PRs** con títulos y cuerpos descriptivos
3. **Monitorear CI/CD** para feedback de build/lint/test
4. **Responder a revisiones de mantenedores** oportunamente
5. **Sincronizar con upstream** antes de merge: `git fetch upstream && git merge upstream/main`

---

*Generado por MiMo v2.5-pro — Xiaomi MiMo Team*
*Orquestado para Proyecto Aura — Dr. Armando Vaquera*
*2026-05-19 14:08 CST (America/Monterrey)*
