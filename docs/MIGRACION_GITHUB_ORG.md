# Guía de Migración a GitHub Organization

## 📋 Estado Actual
- **Repositorio**: proyectoauraorg/Zoo-Code
- **Tipo actual**: Repositorio bajo cuenta personal/organización existente
- **Objetivo**: Migrar a organización dedicada para mejor gestión

## 🔧 Pre-requisitos

### 1. Verificar elegibilidad
```bash
# Verificar si ya pertenece a una organización
gh api repos/proyectoauraorg/Zoo-Code --jq '.owner.login'

# Verificar miembros actuales
gh api repos/proyectoauraorg/Zoo-Code/collaborators --jq '.[].login'
```

### 2. Documentar configuración actual
- Protección de ramas: ✅ Configurada (2 approvals + code owners)
- CODEOWNERS: ✅ Definido (@proyectoauraorg, @KarlaCaballero09)
- Topics: ✅ 6 aplicados
- Discussions: ✅ Habilitado
- Dependabot: ⏳ PR #5 pendiente merge

## 📝 Pasos de Migración

### Paso 1: Crear organización GitHub (manual)
1. Ir a https://github.com/organizations/new
2. Nombre sugerido: `proyectoauraorg` (mantener consistencia)
3. Email: Usar email oficial de Proyecto Aura
4. Plan: Free (para organizaciones open source)

### Paso 2: Transferir repositorio
```bash
# Opción A: Transferencia directa (recomendado)
# Ir a Settings > Danger Zone > Transfer ownership
# Nuevo dueño: proyectoauraorg (nueva organización)

# Opción B: Fork + redirect
gh repo fork proyectoauraorg/Zoo-Code --org nueva-org --remote
```

### Paso 3: Configurar organización
```bash
# Crear teams
gh api orgs/proyectoauraorg/teams -f name="core-maintainers" -f privacy="closed"
gh api orgs/proyectoauraorg/teams -f name="contributors" -f privacy="open"

# Invitar miembros
gh api orgs/proyectoauraorg/invitations \
  -f invitee_id=<user_id> \
  -f role="direct_member"
```

### Paso 4: Actualizar referencias
- [ ] GitHub Actions workflows (si usan org secrets)
- [ ] README badges y links
- [ ] Documentation URLs
- [ ] External integrations

## ⚠️ Consideraciones Importantes

1. **URLs antiguas**: GitHub crea redirects automáticos
2. **Stars/Forks**: Se transfieren con el repo
3. **Issues/PRs**: Se mantienen intactos
4. **Webhooks**: Necesitan reconfiguración
5. **Deploy keys**: Se transfieren

## 🔗 Recursos
- [GitHub Docs: Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [GitHub Docs: Managing membership in your organization](https://docs.github.com/en/organizations/managing-membership-in-your-organization)
