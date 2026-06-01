"use client";

import { useEffect } from "react";

/**
 * Registra un atajo de teclado global (keydown en document).
 * Ignora cuando el foco está en un <input>, <textarea> o elemento con contentEditable.
 *
 * @param key  Tecla literal (e.g. "k")
 * @param modifiers  Modificadores requeridos { meta?, ctrl?, shift?, alt? }
 * @param handler  Callback a ejecutar
 *
 * Ejemplo:
 *   useHotkey("k", { meta: true }, () => setOpen(true));
 *   // También captura Ctrl+K en Windows/Linux
 */
export function useHotkey(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean },
  handler: () => void,
) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // No activar si el foco está en un input/textarea/contentEditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      // ⌘K en Mac, Ctrl+K en Windows/Linux — aceptar ambos
      if (modifiers.meta && !e.metaKey && !e.ctrlKey) return;
      if (modifiers.ctrl && !e.ctrlKey) return;
      if (modifiers.shift && !e.shiftKey) return;
      if (modifiers.alt && !e.altKey) return;

      e.preventDefault();
      handler();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [key, handler, modifiers.meta, modifiers.ctrl, modifiers.shift, modifiers.alt]);
}
