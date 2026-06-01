"use client";

import { useEffect, useState } from "react";

type Mode = "dark" | "light" | "system";
const ORDER: Mode[] = ["dark", "light", "system"];
const META: Record<Mode, { icon: string; label: string }> = {
  dark: { icon: "🌙", label: "Oscuro" },
  light: { icon: "☀️", label: "Claro" },
  system: { icon: "🖥️", label: "Sistema" },
};

function applyMode(mode: Mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Toggle de tema dark-first de 3 estados: Oscuro → Claro → Sistema. Persiste en
 *  localStorage('theme'); el script sin-FOUC del layout lee el mismo valor. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Mode | null;
    if (stored && ORDER.includes(stored)) setMode(stored);
  }, []);

  useEffect(() => {
    applyMode(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* no-op */
    }
    setMode(next);
  }

  const m = META[mode];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema: ${m.label}. Clic para cambiar.`}
      title={`Tema: ${m.label}`}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg"
    >
      <span aria-hidden>{m.icon}</span>
      <span className="hidden sm:inline">{m.label}</span>
    </button>
  );
}
