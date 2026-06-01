import { spawn } from "node:child_process";
import path from "node:path";

// Reusa el sistema de notificaciones del runtime (Apprise) — NO crea uno nuevo.
// Invoca surfacing/notify.py como módulo desde la raíz de zSys.
// El disparador automático del ciclo es el historian (ingest/historian.py); este
// helper expone la misma capacidad al backend Next (best-effort, nunca lanza).

function zsysRoot(): string | null {
  const ctx = process.env.CONTEXT_SYNC_DIR; // .../zSys/.context_sync
  return ctx ? path.dirname(ctx) : null;
}

/**
 * Emite UNA notificación-resumen (anti-spam) con los textos de alta señal.
 * Devuelve `true` si notify.py terminó con código 0. Nunca lanza.
 */
export function notifyCritical(messages: string[]): Promise<boolean> {
  const texts = messages.filter((m) => m && m.trim().length > 0);
  if (texts.length === 0) return Promise.resolve(false);

  const pythonBin = process.env.PYTHON_BIN || "python3";
  const root = zsysRoot();
  if (!root) return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      const child = spawn(
        pythonBin,
        ["-m", "scripts.context_sync.surfacing.notify", ...texts],
        { cwd: root, stdio: "ignore" },
      );
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}
