## 3. Stack Tecnológico y Dependencias

### 3.1 Producción (`dependencies`)

| Paquete | Versión | Rol | Analogía |
|---------|---------|-----|----------|
| [`next`](package.json:26) | `14.2.35` | Framework React con App Router, SSR, API routes | El **edificio** donde vive la app: tiene ascensor (SSR), ventanas al exterior (API) y paredes modulares (rutas). |
| [`react`](package.json:27) / [`react-dom`](package.json:28) | `^18` | Biblioteca de UI declarativa | Los **ladrillos** con los que se construyen los componentes visuales. |
| [`@tanstack/react-query`](package.json:19) | `^5.100.14` | Gestión de estado servidor (fetch, cache, polling) | Un **mensajero inteligente**: va a buscar datos, los cachea, y si le pides que vaya cada 60 segundos, lo hace sin que tú lo gestiones. |
| [`@tremor/react`](package.json:20) | `^3.18.7` | Componentes de charts (SparkAreaChart) | **Gráficas prefabricadas** — como comprar muebles IKEA en vez de carpintería a medida. |
| [`better-sqlite3`](package.json:21) | `^12.10.0` | Driver SQLite síncrono para Node.js | Una **libreta de papel** donde se apuntan los datos. Rápida de leer/escribir, pero solo una persona puede escribir a la vez. |
| [`zod`](package.json:29) | `^4.4.3` | Validación de esquemas en runtime | Un **detector de metales** en la entrada: si los datos no tienen la forma esperada, los rechaza o les pone un valor por defecto. |
| [`class-variance-authority`](package.json:22) | `^0.7.1` | Variants tipadas para clases CSS | Un **selector de variantes** de un producto: "quiero el badge rojo" → te da las clases CSS correctas. |
| [`clsx`](package.json:23) / [`tailwind-merge`](package.json:28) | `^2.1.1` / `^3.6.0` | Merge inteligente de clases CSS | Un **combinador de etiquetas**: si pones "text-red" y luego "text-blue", solo se queda con la última. |
| [`lucide-react`](package.json:24) | `^1.17.0` | Iconos SVG | **Íconos vectoriales** listos para usar (aunque no se usan directamente en el código actual). |

### 3.2 Desarrollo (`devDependencies`)

| Paquete | Rol |
|---------|-----|
| [`typescript`](package.json:42) `^5` | Tipado estático — el "corrector ortográfico" del código |
| [`tailwindcss`](package.json:41) `^3.4.1` | Framework CSS utility-first |
| [`@tailwindcss/forms`](package.json:33) | Reset de estilos de formularios |
| [`@headlessui/tailwindcss`](package.json:32) | Plugin para transiciones de Headless UI |
| [`vitest`](package.json:43) `^4.1.7` | Runner de tests unitarios (rápido, compatible con Jest) |
| [`eslint`](package.json:38) / [`eslint-config-next`](package.json:39) | Linting de código |
| [`postcss`](package.json:40) | Procesador CSS (necesario para Tailwind) |
| `@types/*` | Tipado TypeScript para better-sqlite3, Node, React |

### 3.3 Decisiones de diseño en dependencias

**¿Por qué `better-sqlite3` y no `prisma` o `drizzle`?**

El proyecto es un dashboard **local, de solo lectura**, que lee una DB creada por un script Python externo. No necesita ORM, migraciones ni conexiones de pool. `better-sqlite3` es síncrono y directo — perfecto para leer una DB que ya existe. Es como usar un **abrelatas** en vez de abrir una lata con un cuchillo de cocina: la herramienta correcta para la tarea.

**¿Por qué Tremor y no Recharts directo?**

Tremor es un wrapper de Recharts con componentes pre-diseñados para dashboards. El `SparkAreaChart` de 3 líneas de código reemplazaría ~30 líneas con Recharts puro. Para un proyecto con un solo gráfico, la abstracción vale la pena.

**¿Por qué Zod y no io-ts o yup?**

Zod tiene la mejor integración con TypeScript (inferencia automática de tipos) y el patrón `.catch()` permite degradar con elegancia: si un campo falta, en vez de lanzar un error, devuelve un valor seguro. Esto es crítico porque el snapshot viene de un runtime externo que podría emitir datos parciales.
