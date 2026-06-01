# ZooDash — Estrategia de Versionado Semántico

> **Normativa:** [SemVer 2.0.0](https://semver.org/) + [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)

---

## Formato de versión

```
MAJOR.MINOR.PATCH   (ejemplo: 0.2.0)
  │    │     │
  │    │     └── PATCH: corrección de bugs, sin cambio de comportamiento público
  │    └──────── MINOR: feature nuevo, retrocompatible
  └───────────── MAJOR: breaking change, requiere migración
```

### Pre-1.0 (estado actual)

ZooDash está en **0.x.y** — la API pública no se considera estable. Esto significa:

- `0.1.x` → `0.2.0`: un **MINOR** bump puede incluir cambios que en 1.x serían breaking.
- Se usa `0.MINOR.PATCH` en vez de `0.0.PATCH` porque cada fase del roadmap (V2.a, V2.b…) es un hito sustancial.

### Transición a 1.0

Cuando el Repository Pattern + Postgres estén estables y la API pública (`/api/*`) esté documentada y probada → `1.0.0`.

---

## Cuándo bump cada componente

| Tipo de cambio | Bump | Ejemplo |
|---------------|------|---------|
| Feature nuevo (V2.a Palette) | **MINOR** | `0.1.0` → `0.2.0` |
| Bug fix (import no usado) | **PATCH** | `0.2.0` → `0.2.1` |
| Breaking change en API/DB | **MAJOR** | `0.x.y` → `1.0.0` |
| Cambio de infraestructura (SQLite → PG) | **MINOR** (si retrocompatible con flag) | `0.2.0` → `0.3.0` |
| Cambio de infraestructura (borra SQLite) | **MAJOR** | → `1.0.0` |

---

## Proceso de release

### 1. Desarrollo

```bash
# Trabajar en main (proyecto local, sin PRs)
# Commits descriptivos:
git commit -m "feat(palette): add command palette with cmdk (V2.a)"
git commit -m "fix(api): remove unused POLL_REFRESH_MS import"
git commit -m "docs: add CHANGELOG.md and VERSIONING.md"
```

### 2. Pre-release

```bash
# Verificar que todo pasa
pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build

# Actualizar CHANGELOG.md:
# 1. Mover items de [Unreleased] a la nueva versión
# 2. Añadir fecha YYYY-MM-DD
# 3. Actualizar links de comparación al final

# Bump versión
# Editar package.json "version" manualmente o con:
npm version 0.2.0 --no-git-tag-version
```

### 3. Tag y release

```bash
git add -A
git commit -m "release: v0.2.0 — Command Palette (V2.a)"
git tag -a v0.2.0 -m "v0.2.0: Command Palette (V2.a)"
git push origin main --tags
```

### 4. Convención de commits (Conventional Commits)

| Prefijo | Uso |
|---------|-----|
| `feat:` | Feature nuevo |
| `fix:` | Corrección de bug |
| `docs:` | Solo documentación |
| `refactor:` | Refactorización sin cambio de comportamiento |
| `test:` | Añadir/corregir tests |
| `chore:` | Mantenimiento (deps, configs, CI) |
| `perf:` | Mejora de rendimiento |
| `style:` | Formato, whitespace, sin cambio lógico |

---

## Tags de Git

| Tag | Significado |
|-----|------------|
| `v0.1.0` | v1: Control Plane inicial |
| `v0.2.0` | V2.a: Command Palette |
| `v0.3.0` | V2.b: Contributor Analytics (planeado) |
| `v0.4.0` | V2.c: Discord Panel (planeado) |
| `v1.0.0` | Estabilización API + Repository Pattern + Postgres |

---

## CHANGELOG

El archivo [`CHANGELOG.md`](../CHANGELOG.md) sigue el formato [Keep a Changelog](https://keepachangelog.com/es/1.1.0/):

- **Added**: features nuevos
- **Changed**: cambios en features existentes
- **Deprecated**: features que serán removidos
- **Removed**: features removidos
- **Fixed**: bugs corregidos
- **Security**: vulnerabilidades parcheadas

Cada release tiene su sección con fecha y descripción. La sección `[Unreleased]` acumula cambios entre releases.
