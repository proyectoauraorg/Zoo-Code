import { eventBus } from "@/lib/events/event-bus";
import type { ZooEventSignal } from "@/lib/events/event-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** SSE endpoint — push de cambios en tiempo real a los clientes. */
export function GET() {
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval>;
  let onChange: (ev: ZooEventSignal) => void;

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat cada 15s para mantener viva la conexión
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Listener de eventos
      onChange = (ev: ZooEventSignal) => {
        try {
          const data = JSON.stringify(ev);
          controller.enqueue(
            encoder.encode(`event: changed\ndata: ${data}\n\n`),
          );
        } catch {
          // cliente desconectado
        }
      };

      eventBus.on("changed", onChange);
    },
    cancel() {
      clearInterval(heartbeat);
      eventBus.off("changed", onChange);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
