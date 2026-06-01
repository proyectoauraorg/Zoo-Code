# ZooDash V2.e — Spec técnica: Tiempo Real (Event Stream + SSE + Projection Sync)

> **Estado:** Diseño — no implementado.
> **Autoridad:** Este documento es la spec de implementación de V2.e. Complementa
> [ARCHITECTURE.md](./ARCHITECTURE.md) §4-5 (SSE, latencia),
> [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md) §9 (Event Coalescing, ADR-15).
>
> **ADR aplicados:** ADR-1 (SSE vs WebSocket), ADR-15 (Event Coalescing).

---

## 1. Objetivo

Introducir **tiempo real** en ZooDash: cuando el historian detecta un cambio
(nuevo PR, CI roja, conflicto, merge), la UI se actualiza **automáticamente**
sin esperar al próximo polling cycle.

**Sin introducir Redis, NATS ni JetStream.** Solo in-process EventEmitter + SSE.

---

## 2. Sub-fases

| Sub-fase | Contenido | Riesgo | Valor |
|----------|-----------|--------|-------|
| V2.e.1 | Event bus in-process + SSE endpoint | Bajo | Alto |
| V2.e.2 | Client hook `useRealtime()` + queryKey sync | Bajo | Alto |
| V2.e.3 | Event Coalescing (ventana 500-1000ms) | Bajo | Medio |
| V2.e.4 | Fallback graceful (SSE → polling) | Bajo | Medio |

---

## 3. V2.e.1 — Event bus in-process + SSE endpoint

### 3.1 Arquitectura

```
historian.py
  ↓ (detecta cambios)
  ↓ emite evento
EventBus (Node.js EventEmitter singleton)
  ├── SSE /api/stream (conecta a clientes)
  └── Projector (refresca read models)

Browser (EventSource)
  ← SSE event: changed { entity, ids }
  → TanStack Query: invalidateQueries([entity])
  → refetch automático
```

### 3.2 Event Bus

```typescript
// src/lib/event-bus.ts
import { EventEmitter } from "node:events";

export interface ZooEvent {
  entity: "overview" | "prs" | "issues" | "contributors" | "discord" | "system";
  ids?: number[];    // números de PR/issue afectados (opcional)
  ts: string;        // ISO-8601 UTC
}

class ZooEventBus extends EventEmitter {
  emit(event: "changed", data: ZooEvent): boolean {
    return super.emit(event, data);
  }
}

// Singleton global (sobrevive hot-reload en dev)
const globalForBus = globalThis as unknown as { __zoodashBus?: ZooEventBus };
export const eventBus: ZooEventBus =
  globalForBus.__zoodashBus ?? new ZooEventBus();
globalForBus.__zoodashBus = eventBus;
```

### 3.3 SSE Endpoint

```typescript
// src/app/api/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat cada 15s para mantener viva la conexión
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(":\n\n"));
      }, 15_000);

      // Listener de eventos
      const onChange = (ev: ZooEvent) => {
        const data = JSON.stringify(ev);
        controller.enqueue(
          encoder.encode(`event: changed\ndata: ${data}\n\n`)
        );
      };

      eventBus.on("changed", onChange);

      // Cleanup al desconectar
      // (ReadableStream cancel se llama cuando el cliente cierra)
    },
    cancel() {
      clearInterval(heartbeat);
      eventBus.off("changed", onChange);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### 3.4 Dónde se emiten eventos

El historian (o un wrapper) emite después de cada poll exitoso:

```typescript
// En historian.py → wrapper Node.js o en la API route que invoca el historian
eventBus.emit("changed", {
  entity: "overview",
  ts: new Date().toISOString(),
});
eventBus.emit("changed", {
  entity: "prs",
  ids: changedPrNumbers,
  ts: new Date().toISOString(),
});
```

---

## 4. V2.e.2 — Client hook `useRealtime()`

### 4.1 Hook

```typescript
// src/lib/useRealtime.ts
"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("changed", (e) => {
      const data = JSON.parse(e.data) as { entity: string; ids?: number[] };
      // Invalidar la queryKey correspondiente → TanStack refetch automático
      qc.invalidateQueries({ queryKey: [data.entity] });
    });

    es.onerror = () => {
      // Fallback: cerrar y dejar que TanStack siga con polling
      es.close();
    };

    return () => es.close();
  }, [qc]);
}
```

### 4.2 Integración

Se monta una vez en `Providers` (layout.tsx):

```typescript
function RealtimeBridge() {
  useRealtime();
  return null;
}

// En Providers:
<QueryClientProvider client={client}>
  <RealtimeBridge />
  {children}
</QueryClientProvider>
```

### 4.3 Fallback graceful

Si `EventSource` falla (bloqueado, timeout, error de red):
1. `onerror` cierra la conexión
2. TanStack Query sigue con `refetchInterval` (polling cada 60s, como hoy)
3. La UI no se rompe — simplemente pierde el "push" y vuelve al "pull"

---

## 5. V2.e.3 — Event Coalescing (ADR-15)

### 5.1 Problema

Si el historian genera 200 eventos en pocos segundos (poll con muchos cambios),
no queremos 200 invalidaciones/refetches en el browser.

### 5.2 Solución

Ventana de coalescencia de **500-1000ms**:

```typescript
// src/lib/event-bus.ts (extensión)
class CoalescingBuffer {
  private buffer = new Map<string, ZooEvent>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly windowMs: number;
  private readonly emit: (ev: ZooEvent) => void;

  constructor(windowMs: number, emit: (ev: ZooEvent) => void) {
    this.windowMs = windowMs;
    this.emit = emit;
  }

  push(ev: ZooEvent) {
    // Acumular: si ya hay un evento para la misma entity, merge ids
    const existing = this.buffer.get(ev.entity);
    if (existing) {
      existing.ids = [...new Set([...(existing.ids ?? []), ...(ev.ids ?? [])])];
      return;
    }
    this.buffer.set(ev.entity, ev);

    // Iniciar/reiniciar ventana
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      for (const merged of this.buffer.values()) {
        this.emit(merged);
      }
      this.buffer.clear();
      this.timer = null;
    }, this.windowMs);
  }
}
```

### 5.3 Efecto

```
Input:  200 eventos en 200ms (entity: "prs", ids: [1,2,3,...,200])
Output: 1 evento "changed" { entity: "prs", ids: [1,2,3,...,200] }
        → 1 invalidación → 1 refetch
```

---

## 6. V2.e.4 — Fallback graceful

| Escenario | Comportamiento |
|-----------|---------------|
| SSE conectado | Push en <1s |
| SSE desconectado | Polling cada 60s (refetchInterval actual) |
| SSE reconectado | Vuelve a push automáticamente |
| Browser sin EventSource | Polling (IE11, etc.) |

El hook `useRealtime()` es **adicional** — no reemplaza el polling. Si el SSE
falla, TanStack Query sigue funcionando con `refetchInterval`.

---

## 7. Contrato SSE

```
GET /api/stream
Content-Type: text/event-stream

# Heartbeat (cada 15s):
:\n\n

# Evento:
event: changed
data: {"entity":"prs","ids":[388,387],"ts":"2026-05-30T12:00:00Z"}

event: changed
data: {"entity":"overview","ts":"2026-05-30T12:00:00Z"}
```

### queryKey mapping

| entity SSE | TanStack queryKey | Endpoint refetch |
|-----------|-------------------|------------------|
| `overview` | `["overview"]` | `/api/overview` |
| `prs` | `["prs"]` | `/api/prs` |
| `issues` | `["issues"]` | `/api/issues` |
| `contributors` | `["contributors"]` | `/api/contributors` |
| `discord` | `["discord"]` | `/api/discord` |
| `system` | `["system-health"]` | `/api/system-health` |

---

## 8. Presupuesto de latencia

| Tramo | Objetivo | Notas |
|-------|----------|-------|
| Historian detecta cambio | 0ms | Ya lo hace |
| EventBus.emit() | <1ms | In-process, sin red |
| Coalescing window | 500-1000ms | ADR-15 |
| SSE → browser | <200ms | Conexión viva |
| TanStack invalidate | <50ms | Query invalidada |
| Refetch `/api/*` | 100-400ms | Depende de la query |
| **Total típico** | **~1-2s** | Mucho mejor que 60s polling |

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Memory leak por conexiones SSE | `cancel()` en ReadableStream + cleanup de listeners |
| Event storm (muchos cambios) | Coalescing window (V2.e.3) |
| SSE bloqueado por proxy/CDN | Fallback a polling (V2.e.4) |
| Hot-reload en dev cierra SSE | Client reconnect en `useEffect` |
| Múltiples tabs | Cada tab tiene su propia SSE; TanStack cachea |

---

## 10. Orden de implementación

```
V2.e.1  Event bus + SSE endpoint
        ├── src/lib/event-bus.ts (singleton + ZooEvent type)
        ├── src/app/api/stream/route.ts (SSE con heartbeat)
        └── Emitir eventos desde historian wrapper

V2.e.2  Client hook + sync
        ├── src/lib/useRealtime.ts
        ├── RealtimeBridge en Providers
        └── queryKey mapping

V2.e.3  Event Coalescing
        ├── CoalescingBuffer en event-bus.ts
        └── Ventana configurable (default 750ms)

V2.e.4  Fallback graceful
        ├── EventSource.onerror → close
        └── TanStack sigue con refetchInterval
```

---

## 11. Dependencias nuevas

**Ninguna.** SSE es nativo del browser (`EventSource`) y del servidor
(`ReadableStream` en Route Handlers). `EventEmitter` es de Node.js stdlo.

---

## 12. Contratos que NO cambian

- Todos los endpoints `/api/*` mantienen sus respuestas JSON idénticas.
- El frontend no cambia sus componentes — solo se añade `useRealtime()`.
- El polling sigue funcionando como fallback.

---

## 13. Qué NO introduce V2.e

- ❌ Redis pub/sub (Escalón 3)
- ❌ NATS JetStream (Escalón 4)
- ❌ WebSocket (ADR-1: SSE es suficiente para server→client)
- ❌ Persistencia de eventos (eso es V2.h Event Store)
- ❌ Replay (eso es V2.h)

V2.e es **solo** el canal de comunicación en tiempo real sobre la infraestructura existente.
