# Modelo de Gobernanza — Zoo-Code

> **Definición formal de roles, responsabilidades y flujo de aprobación para el repositorio [`proyectoauraorg/Zoo-Code`](https://github.com/proyectoauraorg/Zoo-Code).**

---

## Roles del Equipo

### 🛡️ Mantenedor / Administrador (`proyectoaura`)

**GitHub user:** `proyectoaura`

| Responsabilidad | Descripción |
|---|---|
| **Autorización** | Decide qué cambios entran al repositorio |
| **Revisión** | Revisa Pull Requests antes de aprobarlos |
| **Aprobación** | Aprueba formalmente los PRs (requerido por branch protection) |
| **Merge a fork** | Ejecuta el merge al repositorio del taller |
| **Envío a upstream** | Prepara y envía PRs hacia [`Zoo-Code-Org/Zoo-Code`](https://github.com/Zoo-Code-Org/Zoo-Code) |

> ⚠️ **Nunca** escribe código directamente. Su rol es exclusivamente de supervisión y aprobación.

---

### ⚙️ Codificador / Programador (`drvaquera`)

**GitHub user:** `drvaquera`

| Responsabilidad | Descripción |
|---|---|
| **Desarrollo** | Escribe código, crea archivos, modifica el proyecto |
| **Commits** | Realiza commits con mensajes descriptivos |
| **PRs** | Crea Pull Requests hacia `main` del taller |
| **Documentación** | Documenta cambios, actualiza guías |
| **Espera aprobación** | **Nunca mergea directamente** — espera la aprobación del mantenedor |

> ⚠️ **Nunca** ejecuta merge sin aprobación formal de `proyectoaura`.

---

## Flujo de Aprobación

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUJO DE TRABAJO                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. drvaquera crea branch de trabajo                        │
│     └── feat/*, fix/*, docs/*                               │
│                                                             │
│  2. drvaquera escribe código y hace commits                 │
│     └── Mensajes descriptivos en inglés o español           │
│                                                             │
│  3. drvaquera crea PR hacia main del taller                 │
│     └── Con plantilla estándar (ver abajo)                  │
│                                                             │
│  4. proyectoaura revisa el PR                               │
│     └── Verifica cambios, tests, documentación              │
│                                                             │
│  5. proyectoaura aprueba el PR                              │
│     └── ✅ Approve review (requerido por branch protection) │
│                                                             │
│  6. proyectoaura ejecuta el merge                           │
│     └── gh pr merge --merge                                 │
│                                                             │
│  7. (Opcional) proyectoaura prepara PR hacia upstream       │
│     └── Solo si el cambio es relevante para Zoo-Code-Org    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Protección de Ramas

La rama `main` del taller tiene las siguientes protecciones activas:

| Protección | Estado | Descripción |
|---|---|---|
| **Require PR** | ✅ Activo | No se puede hacer push directo a `main` |
| **Required approvals** | ✅ 1 | Mínimo 1 aprobación requerida |
| **Enforce admins** | ✅ Activo | Ni el administrador puede saltarse la protección |
| **Dismiss stale reviews** | ✅ Activo | Si se agregan commits después de la review, se invalida |
| **No auto-merge** | ✅ Activo | No se permite auto-merge |

> Esto significa que **todas las contribuciones** requieren aprobación formal de `proyectoaura` antes de entrar a `main`.

---

## Plantilla de Pull Request

### Para PRs dentro del Taller (`proyectoauraorg/Zoo-Code`)

Los PRs creados por `drvaquera` deben seguir esta plantilla:

```markdown
## Descripción
[Qué hace este cambio y por qué]

## Tipo de cambio
- [ ] Feature (nueva funcionalidad)
- [ ] Fix (corrección de bug)
- [ ] Docs (documentación)
- [ ] Refactor (reestructuración sin cambio de comportamiento)
- [ ] Test (pruebas)
- [ ] Chore (mantenimiento)

## Checklist
- [ ] Los tests pasan localmente
- [ ] La documentación está actualizada
- [ ] No hay conflictos con main
- [ ] Los commits tienen mensajes descriptivos

## Notas adicionales
[Cualquier contexto relevante para el mantenedor]
```

### Para PRs hacia Upstream (`Zoo-Code-Org/Zoo-Code`)

Ver [`.github/PULL_REQUEST_TEMPLATE/upstream.md`](../.github/PULL_REQUEST_TEMPLATE/upstream.md) para la plantilla en inglés.

---

## Comunicación entre Roles

| Canal | Uso |
|---|---|
| **PR comments** | Discusiones técnicas sobre cambios específicos |
| **GitHub Discussions** | Ideas, preguntas, planeación general |
| **Issues** | Bugs, features, tareas rastreables |

---

## Decisiones de Gobernanza

| Decisión | Justificación |
|---|---|
| 2 cuentas separadas | Separación clara entre escritura y aprobación |
| `enforce_admins` activo | Incluso el admin no puede hacer bypass — garantiza proceso formal |
| 1 approval requerido | Suficiente para equipo pequeño, escalable a 2+ si crece el equipo |
| `dismiss_stale` activo | Si drvaquera agrega commits después de la review, proyectoaura debe re-revisar |
| Plantillas en inglés para upstream | El upstream es internacional, inglés es el estándar |

---

> **Última actualización:** 2026-05-19
> **Autor:** MiMo (asistente) + drvaquera
> **Aprobado por:** proyectoaura (mantenedor)
