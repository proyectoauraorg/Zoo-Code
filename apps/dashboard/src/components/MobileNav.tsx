"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NAV_LINKS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Navegación móvil (<sm): hamburguesa + drawer. Resuelve el P0 de que el sidebar
 *  desaparece sin reemplazo. Cierra al navegar, con backdrop o con Escape. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar al cambiar de ruta.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape + bloqueo de scroll + foco al panel mientras está abierto.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir navegación"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg sm:hidden"
      >
        <span aria-hidden className="text-lg">
          ☰
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navegación"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col gap-4 border-r border-line bg-surface p-4 outline-none"
          >
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold tracking-tight text-fg">
                🦓 ZooDash
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar navegación"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>
            <nav className="flex flex-col gap-1" aria-label="Principal (móvil)">
              {NAV_LINKS.map((l) => {
                const active = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors duration-fast",
                      active
                        ? "bg-surface-muted text-fg"
                        : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                    )}
                  >
                    <span aria-hidden>{l.icon}</span>
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
