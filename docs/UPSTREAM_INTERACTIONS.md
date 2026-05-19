# Upstream Interactions Reference

> **Catálogo completo de interacciones permitidas y prohibidas con [`Zoo-Code-Org/Zoo-Code`](https://github.com/Zoo-Code-Org/Zoo-Code).**

---

## 🟢 Solo Lectura (Siempre Permitido)

Estas operaciones son **read-only** y se pueden hacer en cualquier momento sin restricciones.

### Fetch y Sincronización

```bash
# Obtener referencias del upstream
git fetch upstream

# Ver branches remotas del upstream
git branch -r | grep upstream

# Ver tags del upstream
git ls-remote --tags upstream
```

### Consultar Issues

```bash
# Listar issues abiertos
gh issue list --repo Zoo-Code-Org/Zoo-Code

# Ver un issue específico
gh issue view 123 --repo Zoo-Code-Org/Zoo-Code

# Buscar issues
gh issue list --repo Zoo-Code-Org/Zoo-Code --search "keyword"
```

### Consultar Pull Requests

```bash
# Listar PRs abiertos
gh pr list --repo Zoo-Code-Org/Zoo-Code

# Ver un PR específico
gh pr view 456 --repo Zoo-Code-Org/Zoo-Code

# Ver diff de un PR
gh pr diff 456 --repo Zoo-Code-Org/Zoo-Code

# Ver checks de un PR
gh pr checks 456 --repo Zoo-Code-Org/Zoo-Code
```

### Consultar Releases

```bash
# Listar releases
gh release list --repo Zoo-Code-Org/Zoo-Code

# Ver detalles de un release
gh release view v3.40.0 --repo Zoo-Code-Org/Zoo-Code
```

### Consultar Código y Configuración

```bash
# Ver el contenido de archivos del upstream
gh api repos/Zoo-Code-Org/Zoo-Code/contents/README.md

# Ver branches
gh api repos/Zoo-Code-Org/Zoo-Code/branches

# Ver colaboradores
gh api repos/Zoo-Code-Org/Zoo-Code/collaborators

# Ver workflow runs de CI
gh run list --repo Zoo-Code-Org/Zoo-Code
```

---

## 🟡 Escritura vía PR (Único Canal de Escritura)

Los **Pull Requests** son el **único mecanismo** para proponer cambios al upstream. Todo PR debe seguir el protocolo establecido.

### Protocolo Obligatorio

1. **Plantilla:** Usar `.github/PULL_REQUEST_TEMPLATE.upstream.md`
2. **PR Interno:** El PR debe haber sido aprobado primero en `proyectoauraorg/Zoo-Code`
3. **Sintaxis:** Usar `--head proyectoauraorg:branch-name` para indicar el fork de origen

### Crear PR hacia Upstream

```bash
# Crear PR usando plantilla
gh pr create \
  --repo Zoo-Code-Org/Zoo-Code \
  --base main \
  --head proyectoauraorg:feat/nombre-branch \
  --title "feat: descripción clara" \
  --body-file .github/PULL_REQUEST_TEMPLATE.upstream.md
```

### Interactuar con un PR Existente

```bash
# Agregar comentario a un PR
gh pr comment 456 --repo Zoo-Code-Org/Zoo-Code --body "Actualización del PR"

# Verificar estado de reviews
gh pr view 456 --repo Zoo-Code-Org/Zoo-Code --json reviews

# Push de correcciones (el PR se actualiza automáticamente)
git push origin feat/nombre-branch
```

### Crear Issue en Upstream (Con Plantilla)

> **Preferir PRs sobre Issues.** Solo crear Issues para reportar bugs o proponer features que no podemos implementar directamente.

```bash
# Crear Issue usando plantilla
gh issue create \
  --repo Zoo-Code-Org/Zoo-Code \
  --title "bug: descripción del problema" \
  --body-file .github/ISSUE_TEMPLATE.upstream.md
```

### Labels y Asignaciones (Solo Lectura + Comentarios)

```bash
# Ver labels disponibles
gh label list --repo Zoo-Code-Org/Zoo-Code

# Comentar en Issues existentes (si tenemos permiso)
gh issue comment 123 --repo Zoo-Code-Org/Zoo-Code --body "Contexto adicional desde proyectoauraorg"
```

---

## 🔴 Prohibido (NUNCA Hacer)

Cualquier acción en esta sección está **estrictamente prohibida** y puede resultar en:
- Pérdida de acceso al upstream
- Conflictos con el equipo upstream
- Compromiso de la integridad del proyecto

### Push Directo al Upstream

```bash
# ❌ PROHIBIDO — Push directo a cualquier branch
git push upstream main
git push upstream feat/algo
git push upstream --force

# ❌ PROHIBIDO — Push de tags
git push upstream v1.0.0
```

### Merge Directo al Upstream

```bash
# ❌ PROHIBIDO — Merge local hacia upstream
git checkout upstream/main
git merge feat/algo
git push upstream main

# ❌ PROHIBIDO — Rebase en upstream
git checkout upstream/main
git rebase feat/algo
```

### Modificar Configuración del Upstream

```
❌ PROHIBIDO — Cualquier modificación vía GitHub UI, API o CLI:
  - Cambiar settings del repositorio
  - Modificar branch protection rules
  - Cambiar permisos de colaboradores
  - Modificar webhooks
  - Cambiar GitHub Actions workflows directamente
  - Editar archivos del repositorio directamente
  - Crear o eliminar branches en el upstream
  - Modificar secrets del repositorio
  - Cambiar la configuración de merge (squash, rebase, merge commit)
```

### Crear Recursos sin Plantilla

```
❌ PROHIBIDO — Crear Issues sin usar .github/ISSUE_TEMPLATE.upstream.md
❌ PROHIBIDO — Crear PRs sin usar .github/PULL_REQUEST_TEMPLATE.upstream.md
❌ PROHIBIDO — Enviar PRs que no hayan sido aprobados internamente primero
```

### Exponer Información Sensible

```
❌ PROHIBIDO — Incluir en PRs o Issues hacia upstream:
  - Tokens, API keys o credenciales
  - Datos internos del taller (proyectoauraorg)
  - Información de configuración privada
  - Logs con datos sensibles
  - Referencias a infraestructura interna
```

---

## Resumen Visual

```
┌─────────────────────────────────────────────────────┐
│              Zoo-Code-Org/Zoo-Code (Upstream)        │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │  🟢 Read  │  │ 🟡 PR Only│  │   🔴 Never    │   │
│  │           │  │           │  │               │   │
│  │ • fetch   │  │ • PRs     │  │ • git push    │   │
│  │ • issues  │  │ • Issues  │  │ • git merge   │   │
│  │ • PRs     │  │  (w/tmpl) │  │ • config edit │   │
│  │ • releases│  │ • comments│  │ • direct edit │   │
│  │ • code    │  │           │  │ • secrets     │   │
│  └───────────┘  └───────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────┘
                        ▲
                        │ PR con plantilla
                        │ (único canal)
┌─────────────────────────────────────────────────────┐
│           proyectoauraorg/Zoo-Code (Taller)          │
│                                                     │
│  Aquí ocurre TODO el desarrollo:                    │
│  • Branches, commits, tests, PRs internos           │
│  • Validación completa antes de upstream             │
└─────────────────────────────────────────────────────┘
```

---

## Plantillas Disponibles

| Plantilla | Uso | Ubicación |
|---|---|---|
| PR Template | Para PRs hacia upstream | `.github/PULL_REQUEST_TEMPLATE.upstream.md` |
| Issue Template | Para Issues en upstream | `.github/ISSUE_TEMPLATE.upstream.md` |
| Workflow Guide | Referencia completa del flujo | [`docs/UPSTREAM_WORKFLOW.md`](UPSTREAM_WORKFLOW.md) |
