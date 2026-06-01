"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useHotkey } from "@/lib/useHotkey";
import { cn } from "@/lib/utils";
import type { SearchResponse } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { NAV_LINKS } from "@/lib/nav";

/**
 * Command Palette (⌘K / Ctrl+K) — V2.a
 *
 * Cuatro modos:
 *   1. **Navegación** — saltar a Overview / PR Board / Issues
 *   2. **Búsqueda** — buscar PRs (#100, "fix"), issues, (futuro) contributors
 *   3. **Acciones** — refrescar datos, cambiar tema, abrir upstream en GitHub
 *   4. **Operaciones** — placeholder para V2+ (replay, alerting, etc.)
 *
 * Usa cmdk (headless, accesible) estilizado con tokens v1.
 * La búsqueda se hace con debounce contra /api/search.
 * Montado una sola vez en layout.tsx.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abrir/cerrar con ⌘K / Ctrl+K
  useHotkey("k", { meta: true }, () => setOpen((prev) => !prev));

  // Cerrar con Escape (cmdk ya lo maneja, pero aseguramos)
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Búsqueda con debounce (300ms)
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as SearchResponse;
          setResults(data);
        }
      } catch {
        // Degradación: no mostrar resultados si falla
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Acciones
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries();
    setOpen(false);
  }, [queryClient]);

  const toggleTheme = useCallback(() => {
    const order = ["dark", "light", "system"] as const;
    const current = (localStorage.getItem("theme") ?? "dark") as string;
    const next = order[(order.indexOf(current as typeof order[number]) + 1) % order.length];
    try {
      localStorage.setItem("theme", next);
    } catch { /* no-op */ }
    const dark =
      next === "dark" ||
      (next === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    setOpen(false);
  }, []);

  const openUpstream = useCallback(() => {
    window.open("https://github.com/Zoo-Code-Org/Zoo-Code", "_blank", "noreferrer");
    setOpen(false);
  }, []);

  const navigateTo = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
    },
    [router],
  );

  const hasSearchResults =
    results &&
    (results.prs.length > 0 ||
      results.issues.length > 0 ||
      results.contributors.length > 0);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Palette"
      className="fixed inset-0 z-50"
      onKeyDown={(e) => {
        // Escape cierra el diálogo
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Panel del diálogo */}
      <Command.Group
        className={cn(
          "fixed left-1/2 top-[15vh] z-50 w-[95vw] max-w-lg -translate-x-1/2",
          "overflow-hidden rounded-lg border border-line bg-surface shadow-popover",
        )}
      >
        {/* Input de búsqueda */}
        <div className="flex items-center gap-2 border-b border-line px-3">
          <span aria-hidden className="text-fg-subtle">
            🔍
          </span>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar PR, issue o escribir un comando…"
            className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="hidden rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle sm:inline">
            esc
          </kbd>
        </div>

        {/* Lista de resultados */}
        <Command.List className="max-h-[50vh] overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-sm text-fg-subtle">
            {loading ? "Buscando…" : "Sin resultados."}
          </Command.Empty>

          {/* ── Modo Navegación (solo sin query) ── */}
          {!query.trim() && (
            <Command.Group
              heading="Navegación"
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle"
            >
              {NAV_LINKS.map((link) => (
                <Command.Item
                  key={link.href}
                  value={`navegar ${link.label}`}
                  onSelect={() => navigateTo(link.href)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-muted aria-selected:bg-surface-muted aria-selected:text-fg"
                >
                  <span aria-hidden>{link.icon}</span>
                  {link.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── Modo Acciones (solo sin query) ── */}
          {!query.trim() && (
            <Command.Group
              heading="Acciones"
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle"
            >
              <Command.Item
                value="refrescar datos refresh"
                onSelect={refreshAll}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-muted aria-selected:bg-surface-muted aria-selected:text-fg"
              >
                <span aria-hidden>↻</span>
                Refrescar datos
              </Command.Item>
              <Command.Item
                value="cambiar tema theme oscuro claro"
                onSelect={toggleTheme}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-muted aria-selected:bg-surface-muted aria-selected:text-fg"
              >
                <span aria-hidden>🎨</span>
                Cambiar tema
              </Command.Item>
              <Command.Item
                value="abrir github upstream"
                onSelect={openUpstream}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-muted aria-selected:bg-surface-muted aria-selected:text-fg"
              >
                <span aria-hidden>↗</span>
                Abrir en GitHub
              </Command.Item>
            </Command.Group>
          )}

          {/* ── Resultados de búsqueda (solo con query) ── */}
          {hasSearchResults && results!.prs.length > 0 && (
            <Command.Group
              heading={`PRs (${results!.prs.length})`}
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle"
            >
              {results!.prs.map((pr) => (
                <Command.Item
                  key={`pr-${pr.number}`}
                  value={`pr #${pr.number} ${pr.title}`}
                  onSelect={() => {
                    window.open(pr.url, "_blank", "noreferrer");
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-fg-muted aria-selected:bg-surface-muted aria-selected:text-fg"
                >
                  <span className="truncate">
                    <span className="font-mono text-fg-subtle">#{pr.number}</span>{" "}
                    {pr.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      pr.state === "OPEN"
                        ? "bg-info-bg text-info"
                        : pr.state === "MERGED"
                          ? "bg-merged-bg text-merged"
                          : "bg-surface-muted text-fg-subtle",
                    )}
                  >
                    {pr.state}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {hasSearchResults && results!.issues.length > 0 && (
            <Command.Group
              heading={`Issues (${results!.issues.length})`}
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle"
            >
              {results!.issues.map((iss) => (
                <Command.Item
                  key={`iss-${iss.number}`}
                  value={`issue #${iss.number} ${iss.title}`}
                  onSelect={() => {
                    window.open(iss.url, "_blank", "noreferrer");
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-fg-muted aria-selected:bg-surface-muted aria-selected:text-fg"
                >
                  <span className="truncate">
                    <span className="font-mono text-fg-subtle">#{iss.number}</span>{" "}
                    {iss.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      iss.state === "OPEN"
                        ? "bg-success-bg text-success"
                        : "bg-surface-muted text-fg-subtle",
                    )}
                  >
                    {iss.state}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── Operaciones (placeholder V2+) ── */}
          {!query.trim() && (
            <Command.Group
              heading="Operaciones"
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle"
            >
              <Command.Item
                disabled
                value="replay proyecciones"
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-subtle opacity-50 aria-selected:bg-surface-muted"
              >
                <span aria-hidden>⏪</span>
                Replay proyecciones
                <span className="ml-auto text-[10px] text-fg-subtle">v2.h</span>
              </Command.Item>
              <Command.Item
                disabled
                value="alertas alerting"
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-subtle opacity-50 aria-selected:bg-surface-muted"
              >
                <span aria-hidden>🔔</span>
                Gestionar alertas
                <span className="ml-auto text-[10px] text-fg-subtle">v2.g</span>
              </Command.Item>
            </Command.Group>
          )}
        </Command.List>

        {/* Footer con atajos */}
        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[10px] text-fg-subtle">
          <span>
            <kbd className="rounded border border-line px-1">↑↓</kbd> navegar
            <kbd className="ml-2 rounded border border-line px-1">↵</kbd> seleccionar
          </span>
          <span>
            <kbd className="rounded border border-line px-1">esc</kbd> cerrar
          </span>
        </div>
      </Command.Group>
    </Command.Dialog>
  );
}
