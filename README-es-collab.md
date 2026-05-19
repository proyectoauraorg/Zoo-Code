<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ZooCodeOrganization.zoo-code"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/ZooCodeDev"><img src="https://img.shields.io/badge/ZooCode-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
  <a href="https://youtube.com/@roocodeyt?feature=shared"><img src="https://img.shields.io/badge/YouTube-FF0000?style=flat&logo=youtube&logoColor=white" alt="YouTube"></a>
  <a href="https://discord.gg/VxfP4Vx3gX"><img src="https://img.shields.io/badge/Join%20Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Join Discord"></a>
  <a href="https://www.reddit.com/r/ZooCode/"><img src="https://img.shields.io/badge/Join%20r%2FZooCode-FF4500?style=flat&logo=reddit&logoColor=white" alt="Join r/ZooCode"></a>
  <a href="https://github.com/Zoo-Code-Org/Zoo-Code/issues"><img src="https://img.shields.io/badge/GitHub-Issues-181717?style=flat&logo=github&logoColor=white" alt="GitHub Issues"></a>
  <a href="https://github.com/Zoo-Code-Org/Zoo-Code"><img src="https://img.shields.io/badge/Upstream-Zoo--Code--Org/Zoo--Code-blue?style=flat&logo=github&logoColor=white" alt="Upstream"></a>
  <a href="https://github.com/proyectoauraorg/Zoo-Code"><img src="https://img.shields.io/badge/Colaborativo-proyectoauraorg/Zoo--Code-green?style=flat&logo=github&logoColor=white" alt="Colaborativo"></a>
</p>
<p align="center">
  <em>¿Necesitas ayuda? → <a href="https://discord.gg/VxfP4Vx3gX">Únete a Discord</a> • ¿Prefieres async? → <a href="https://www.reddit.com/r/ZooCode/">Únete a r/ZooCode</a></em>
</p>

---

# Zoo Code

> Tu equipo de desarrollo con IA, directamente en tu editor

---

## 📌 Relación con el proyecto original

> **⚠️ IMPORTANTE:** Este repositorio (`proyectoauraorg/Zoo-Code`) **NO es un fork independiente, separado, divergente ni competidor.** Es el **repositorio colaborativo oficial de desarrollo, mantenimiento y contribución activa** que opera como extensión directa del proyecto original.
>
> **El repositorio original, canónico y fuente de verdad siempre será [`https://github.com/Zoo-Code-Org/Zoo-Code`](https://github.com/Zoo-Code-Org/Zoo-Code).** Toda la autoridad última sobre el proyecto reside allí.
>
> Este repositorio existe para facilitar:
> - 🛠️ Desarrollo colaborativo organizado
> - 🧪 Testing integrado
> - 📋 Gestión de PRs y contribuciones que luego se proponen upstream
> - 📖 Mantenimiento documentado
> - 🔄 Sincronización constante con el repositorio original

---

## 👤 Mantenedor principal

**[@drvaquera](https://github.com/drvaquera)** actúa como mantenedor principal de esta rama colaborativa, en coordinación directa con el equipo del proyecto original. Toda sincronización se realiza con atribución completa y transparente.

---

## 🔄 Flujo de sincronización

Este repositorio se mantiene sincronizado con el upstream mediante el siguiente flujo documentado:

### Procedimiento estándar de sincronización

```bash
# 1. Actualizar main local con los últimos cambios de upstream
git checkout main
git pull origin main
git merge upstream/main --no-edit

# 2. Crear branch de sincronización con fecha
SYNC_BRANCH="sync/upstream-$(date +%Y-%m-%d)"
git push origin main:"$SYNC_BRANCH"

# 3. Crear PR descriptivo
gh pr create --repo proyectoauraorg/Zoo-Code \
  --base main \
  --head "$SYNC_BRANCH" \
  --title "chore: sync main with Zoo-Code-Org upstream ($(date +%Y-%m-%d))" \
  --body "## Sincronización con upstream
  ...
  Referencia upstream: Zoo-Code-Org/Zoo-Code
  Sincronizado por: drvaquera (mantenedor de proyectoauraorg/Zoo-Code)
  "

# 4. Aprobación y merge
gh pr merge "$PR_NUMBER" --merge
```

### Atribución

Cada sincronización incluye en el mensaje de commit:
- El commit SHA del upstream integrado
- La branch de origen y destino
- El contexto colaborativo
- Mención al trabajo original cuando corresponde

Formato de cita: `Basado en trabajo de drvaquera (commit {SHA}, branch {nombre}) — proyectoauraorg/Zoo-Code`

---

## 📋 Historial de sincronizaciones recientes

| Fecha | Commit SHA | Branch | Resumen |
|-------|-----------|--------|---------|
| 2026-05-19 | `f0eb163` | main → sync/upstream-2026-05-19 | Sincronización inicial con Zoo-Code-Org/Zoo-Code upstream |

---

## Quiénes somos en Zoo Code

> Puede que hayas visto el
> [anuncio reciente](https://x.com/mattrubens/status/2046636598859559114)
> del equipo de Roo 🦘🦘🦘. El resumen es que el equipo está dejando el desarrollo activo de Roo
> Code para enfocarse en [Roomote](https://roomote.dev/). Esa noticia
> fue difícil para muchos usuarios de Roo, este plugin significa mucho para esta comunidad.
>
> Queremos agradecer a todo el equipo de Roo por el trabajo que pusieron en este plugin.
> No nombraremos a cada persona aquí, pero todos podemos estar de acuerdo en que son
> desarrolladores excepcionales y, lo que es igualmente importante, personas increíbles. Gracias
> al equipo de Roo.
>
> Como programadores de Roo, venimos en todas las formas y tamaños. Algunos de nosotros lo usamos
> profesionalmente en nuestro trabajo diario, algunos lo usamos para experimentar y
> diseñar flujos de trabajo inimaginablemente complicados. Algunos lo usamos para mejorar el propio Roo
> mientras otros lo usan para mejorar los modelos que Roo está usando
> (súper meta). El punto que queremos hacer es que la comunidad es
> diversa, y aunque un canguro 🦘🦘🦘 es un animal distinguido y noble,
> sentimos que un "Zoo" 🐘🦡🦒🦓🦛🦧🦭🦦 de especies diferentes reflejaba mejor esta
> diversidad de los usuarios del plugin.
>
> Así que nos gustaría anunciar que **Zoo Code** continuará el desarrollo de
> este importante proyecto. El equipo central es un grupo de desarrolladores que contribuyeron
> a Roo anteriormente y que se preocupan profundamente por este plugin. Continuaremos haciendo
> actualizaciones de modelos, corrigiendo errores y lanzando características. Pero sobre todo, planeamos
> escuchar a la comunidad que hizo este plugin tan especial. Siéntete libre de unirte
> a nosotros en [Discord](https://discord.gg/VxfP4Vx3gX),
> [Reddit](https://www.reddit.com/r/ZooCode), o
> [abrir un PR o issue](https://github.com/Zoo-Code-Org/Zoo-Code), y sobre todo,
> por favor mantente involucrado, conectado y activo como comunidad.
>
> _-Equipo de Zoo Code_

---

## Migración de Roo Code a Zoo Code

Puedes encontrar una guía rápida para migrar de Roo Code a Zoo Code en la [guía de migración Roo→Zoo](https://docs.zoocode.dev/roo-to-zoo-migration). Planeamos ayudar a los usuarios durante la transición. Tenemos nuestro [Reddit](https://www.reddit.com/r/ZooCode) y [Discord](https://discord.gg/VxfP4Vx3gX)
para este apoyo exacto, así que si tienes problemas o preguntas, únete y pregunta.

---

## 🤖 Cómo contribuir

1. Las contribuciones se dirigen **primero a este repositorio** (`proyectoauraorg/Zoo-Code`)
2. Una vez revisadas y mergeadas aquí, se proponen como PR al repositorio original (`Zoo-Code-Org/Zoo-Code`)
3. Esto permite un flujo de desarrollo organizado con testing previo a la integración upstream

### Flujo para contribuidores:
1. Fork este repositorio (`proyectoauraorg/Zoo-Code`)
2. Crea una branch descriptiva (`feat/mi-feature`, `fix/mi-bug`)
3. Haz tus cambios y envía un PR a `proyectoauraorg/Zoo-Code`
4. El mantenedor [@drvaquera](https://github.com/drvaquera) revisará y mergeará
5. Los cambios se sincronizarán upstream cuando corresponda

---

## ¿Qué puede hacer Zoo Code POR TI?

- **Generar código** a partir de descripciones y especificaciones en lenguaje natural
- **Adaptarse con Modos**: Código, Arquitecto, Preguntas, Depuración y Modos Personalizados
- **Refactorizar y depurar** código existente
- **Escribir y actualizar** documentación
- **Responder preguntas** sobre tu base de código
- **Automatizar tareas** repetitivas
- **Utilizar servidores MCP**

---

## Modos

Zoo Code se adapta a cómo trabajas:

- **Modo Código**: coding diario, ediciones y operaciones con archivos
- **Modo Arquitecto**: planificación de sistemas, especificaciones y migraciones
- **Modo Preguntas**: respuestas rápidas, explicaciones y documentación
- **Modo Depuración**: rastreo de problemas, agregar logs, aislar causas raíz
- **Modos Personalizados**: crea modos especializados para tu equipo o flujo de trabajo

Aprende más: [Usando Modos](https://docs.zoocode.dev/basic-usage/using-modes) •
[Modos Personalizados](https://docs.zoocode.dev/advanced-usage/custom-modes)

---

## Tutoriales y videos de características

<div align="center">

|                                                                                                                                                                                                               |                                                                                                                                                                                                       |                                                                                                                                                                                                   |
| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <a href="https://www.youtube.com/watch?v=Mcq3r1EPZ-4"><img src="https://img.youtube.com/vi/Mcq3r1EPZ-4/maxresdefault.jpg" width="100%" alt="Instalando la extensión"></a><br><b>Instalando la extensión</b> | <a href="https://www.youtube.com/watch?v=ZBML8h5cCgo"><img src="https://img.youtube.com/vi/ZBML8h5cCgo/maxresdefault.jpg" width="100%" alt="Configurando perfiles"></a><br><b>Configurando perfiles</b> |  <a href="https://www.youtube.com/watch?v=r1bpod1VWhg"><img src="https://img.youtube.com/vi/r1bpod1VWhg/maxresdefault.jpg" width="100%" alt="Indexación de código"></a><br><b>Indexación de código</b>  |
|             <a href="https://www.youtube.com/watch?v=iiAv1eKOaxk"><img src="https://img.youtube.com/vi/iiAv1eKOaxk/maxresdefault.jpg" width="100%" alt="Modos personalizados"></a><br><b>Modos personalizados</b>             |          <a href="https://www.youtube.com/watch?v=Ho30nyY332E"><img src="https://img.youtube.com/vi/Ho30nyY332E/maxresdefault.jpg" width="100%" alt="Puntos de control"></a><br><b>Puntos de control</b>          | <a href="https://www.youtube.com/watch?v=HmnNSasv7T8"><img src="https://img.youtube.com/vi/HmnNSasv7T8/maxresdefault.jpg" width="100%" alt="Gestión de contexto"></a><br><b>Gestión de contexto</b> |

</div>
<p align="center">
<a href="https://docs.zoocode.dev/tutorial-videos">Más tutoriales rápidos y videos de características...</a>
</p>

---

## Recursos

- **[Documentación](https://docs.zoocode.dev):** La guía oficial para
  instalar, configurar y dominar Zoo Code.
- **[Canal de YouTube](https://youtube.com/@roocodeyt?feature=shared):** Mira
  tutoriales y características en acción.
- **[Servidor de Discord](https://discord.gg/VxfP4Vx3gX):** Únete a la comunidad para
  ayuda en tiempo real y discusión.
- **[Comunidad de Reddit](https://www.reddit.com/r/ZooCode/):** Comparte tus
  experiencias y ve lo que otros están construyendo.
- **[Issues de GitHub](https://github.com/Zoo-Code-Org/Zoo-Code/issues):** Reporta
  errores y sigue el desarrollo.
- **[Solicitudes de características](https://github.com/Zoo-Code-Org/Zoo-Code/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop):**
  ¿Tienes una idea? Compártela con los desarrolladores.

---

## Configuración local y desarrollo

1. **Clona** el repositorio:

```sh
git clone https://github.com/proyectoauraorg/Zoo-Code.git
cd Zoo-Code
```

2. **Instala dependencias**:

```sh
pnpm install
```

3. **Ejecuta la extensión**:

Hay varias formas de ejecutar la extensión Zoo Code:

### Modo de desarrollo (F5)

Para desarrollo activo, usa la depuración integrada de VSCode:

Presiona `F5` (o ve a **Run** → **Start Debugging**) en VSCode. Esto abrirá una
nueva ventana de VSCode con la extensión Zoo Code ejecutándose.

- Los cambios en el webview aparecerán inmediatamente.
- Los cambios en la extensión principal también se recargarán automáticamente.

### Instalación automatizada de VSIX

Para compilar e instalar la extensión como un paquete VSIX directamente en VSCode:

```sh
pnpm install:vsix [-y] [--editor=<comando>]
```

Este comando:

- Preguntará qué comando de editor usar (code/cursor/code-insiders) - por defecto 'code'
- Desinstalará cualquier versión existente de la extensión.
- Compilará el último paquete VSIX.
- Instalará el VSIX recién compilado.
- Te pedirá reiniciar VS Code para que los cambios surtan efecto.

Opciones:

- `-y`: Saltar todas las confirmaciones y usar valores por defecto
- `--editor=<comando>`: Especificar el comando del editor (ej., `--editor=cursor` o `--editor=code-insiders`)

### Instalación manual de VSIX

Si prefieres instalar el paquete VSIX manualmente:

1. Primero, compila el paquete VSIX:
    ```sh
    pnpm vsix
    ```
2. Se generará un archivo `.vsix` en el directorio `bin/` (ej., `bin/zoo-code-<version>.vsix`).
3. Instálalo manualmente usando la CLI de VSCode:
    ```sh
    code --install-extension bin/zoo-code-<version>.vsix
    ```

---

Usamos [changesets](https://github.com/changesets/changesets) para versionado y
publicación. Consulta nuestro `CHANGELOG.md` para las notas de release.

---

## Descargo de responsabilidad

**Ten en cuenta** que Zoo Code **no** hace representaciones ni
garantías respecto a ningún código, modelos u otras herramientas proporcionadas o puestas a disposición
en conexión con Zoo Code, ninguna herramienta de terceros asociada, o cualquier resultado
producido. Asumes **todos los riesgos** asociados con el uso de tales herramientas o
resultados; tales herramientas se proporcionan **"TAL CUAL"** y **"SEGÚN DISPONIBILIDAD"**.
Tales riesgos pueden incluir, sin limitación, infracción de propiedad intelectual,
vulnerabilidades o ciberataques, sesgos, inexactitudes, errores, defectos, virus,
tiempo de inactividad, pérdida o daño a la propiedad y/o lesiones personales. Eres el único
responsable de tu uso de tales herramientas o resultados (incluyendo, sin
limitación, la legalidad, idoneidad y resultados de los mismos).

---

## Licencia

[Apache 2.0 © 2026 Zoo Code Org](./LICENSE)

---

**¡Disfruta Zoo Code!** Ya sea que lo mantengas bajo control o lo dejes vagar
autónomamente, estamos ansiosos por ver lo que construyes. Si tienes preguntas o
ideas de características, visita nuestra [comunidad de Reddit](https://www.reddit.com/r/ZooCode/)
o [Discord](https://discord.gg/VxfP4Vx3gX), o abre un
[issue](https://github.com/Zoo-Code-Org/Zoo-Code/issues). ¡Feliz programación!
