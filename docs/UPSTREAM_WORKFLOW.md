# Upstream Workflow Guide

> **Canonical reference for all interactions with the upstream repository.**

## Regla Fundamental

| Repositorio | Rol | Permisos |
|---|---|---|
| [`proyectoauraorg/Zoo-Code`](https://github.com/proyectoauraorg/Zoo-Code) | **Taller** — nuestro workspace principal | Lectura y escritura completas |
| [`Zoo-Code-Org/Zoo-Code`](https://github.com/Zoo-Code-Org/Zoo-Code) | **Upstream canónico** — el repo oficial | **Solo lectura directa + PRs** |

**NUNCA** se hace push directo, merge directo o cualquier modificación al upstream. El **único canal de escritura** hacia upstream es mediante Pull Requests desde nuestro fork.

---

## Flujo Completo Paso a Paso

### Paso 1: Sincronizar con Upstream

Antes de iniciar cualquier trabajo, asegúrate de tener el upstream configurado y tu `main` actualizado:

```bash
# Configurar upstream (solo una vez)
git remote add upstream https://github.com/Zoo-Code-Org/Zoo-Code.git

# Verificar remotos
git remote -v

# Sincronizar
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

### Paso 2: Crear Branch de Trabajo en Nuestro Fork

```bash
# Crear branch descriptiva
git checkout -b feat/nombre-descriptivo

# O para docs:
git checkout -b docs/nombre-descriptivo

# O para fixes:
git checkout -b fix/nombre-descriptivo
```

### Paso 3: Hacer Cambios, Commits y Tests

```bash
# Hacer cambios...
git add -A
git commit -m "feat: descripción clara del cambio"

# Ejecutar tests según el área afectada
# Backend: cd src && npx vitest run path/to/test
# UI: cd webview-ui && npx vitest run src/path/to/test
```

### Paso 4: Push a Nuestro Fork

```bash
git push origin feat/nombre-descriptivo
```

### Paso 5: Validar en Nuestro Fork

Antes de enviar a upstream, valida todo en nuestro fork:

```bash
# PR interno en proyectoauraorg/Zoo-Code para revisión
gh pr create \
  --repo proyectoauraorg/Zoo-Code \
  --base main \
  --head feat/nombre-descriptivo \
  --title "feat: descripción del cambio" \
  --body "Descripción detallada"
```

Merge el PR interno después de aprobación y CI passing.

### Paso 6: Preparar PR hacia Upstream

Usa **siempre** la plantilla `.github/PULL_REQUEST_TEMPLATE.upstream.md`:

```bash
# Crear PR hacia upstream usando la plantilla
gh pr create \
  --repo Zoo-Code-Org/Zoo-Code \
  --base main \
  --head proyectoauraorg:feat/nombre-descriptivo \
  --title "feat: descripción del cambio" \
  --body-file .github/PULL_REQUEST_TEMPLATE.upstream.md
```

> **Nota:** `--head proyectoauraorg:branch-name` indica que el PR viene de nuestro fork.

### Paso 7: Responder Reviews

```bash
# Hacer cambios solicitados por reviewers
git add -A
git commit -m "fix: corrección solicitada en review"
git push origin feat/nombre-descriptivo

# El PR en upstream se actualiza automáticamente
```

---

## Checklist Pre-PR (Antes de Enviar a Upstream)

- [ ] **Sync:** `main` está sincronizado con `upstream/main`
- [ ] **Branch:** La branch está limpia, sin commits de trabajo intermedio
- [ ] **Tests:** Todos los tests pasan (`npx vitest run`)
- [ ] **Lint:** Sin errores de lint
- [ ] **Build:** El build es exitoso
- [ ] **PR Interno:** El PR en `proyectoauraorg/Zoo-Code` fue aprobado y mergeado
- [ ] **Plantilla:** El PR hacia upstream usa `.github/PULL_REQUEST_TEMPLATE.upstream.md`
- [ ] **Commits:** Mensajes claros y descriptivos (conventional commits)
- [ ] **Breaking Changes:** Documentados en el PR si aplican
- [ ] **Signed-off-by:** Incluido en el PR
- [ ] **No secrets:** No se incluyen tokens, credenciales ni datos sensibles

---

## Reglas de Seguridad

### ❌ NUNCA hacer esto:

```bash
# NUNCA hacer push directo al upstream
git push upstream main                    # ❌ PROHIBIDO
git push upstream feat/algo               # ❌ PROHIBIDO

# NUNCA merge directo al upstream
git checkout upstream/main && git merge .  # ❌ PROHIBIDO

# NUNCA modificar configuración del upstream
# (via GitHub UI, API o cualquier medio)

# NUNCA crear Issues en upstream sin la plantilla

# NUNCA incluir secrets, tokens o credenciales en PRs
```

### ✅ SIEMPRE hacer esto:

```bash
# SIEMPRE trabajar en nuestro fork
git push origin feat/nombre-branch        # ✅ CORRECTO

# SIEMPRE usar PR para enviar cambios a upstream
gh pr create --repo Zoo-Code-Org/Zoo-Code  # ✅ CORRECTO

# SIEMPRE usar la plantilla de PR para upstream
--body-file .github/PULL_REQUEST_TEMPLATE.upstream.md  # ✅ CORRECTO
```

---

## Comandos de Referencia Rápida

| Acción | Comando |
|---|---|
| Verificar remotos | `git remote -v` |
| Sync con upstream | `git fetch upstream && git merge upstream/main` |
| Crear branch | `git checkout -b feat/nombre` |
| Push a fork | `git push origin feat/nombre` |
| PR interno | `gh pr create --repo proyectoauraorg/Zoo-Code` |
| PR a upstream | `gh pr create --repo Zoo-Code-Org/Zoo-Code --head proyectoauraorg:branch` |
| Ver PRs upstream | `gh pr list --repo Zoo-Code-Org/Zoo-Code` |
| Ver Issues upstream | `gh issue list --repo Zoo-Code-Org/Zoo-Code` |

---

## Estructura de Plantillas

- **PRs hacia upstream:** `.github/PULL_REQUEST_TEMPLATE.upstream.md`
- **Issues en upstream:** `.github/ISSUE_TEMPLATE.upstream.md`

Ambas plantillas incluyen el campo `Submitted by` / `Reported by` con link a nuestro fork para trazabilidad.
