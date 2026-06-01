// API middleware — captura latencia y errores por endpoint (V2.d.4).

import { recordRequest } from "@/lib/metrics";

/**
 * Envuelve un handler de Route Handler midiendo latencia y registrando errores.
 * Uso: export const GET = withMetrics(handleGet);
 */
export function withMetrics(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const start = performance.now();
    let isError = false;
    try {
      const res = await handler(req);
      if (res.status >= 400) isError = true;
      return res;
    } catch (err) {
      isError = true;
      throw err;
    } finally {
      const latencyMs =
        Math.round((performance.now() - start) * 100) / 100;
      const url = new URL(req.url);
      recordRequest(url.pathname, latencyMs, isError);
    }
  };
}
