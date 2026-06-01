import * as React from "react";

import { cn } from "@/lib/utils";

/** Tooltip ligero CSS (sin dependencias): aparece en hover y en focus-within (si el
 *  hijo es enfocable). Es complementario — la info esencial va también en sr-only en
 *  los badges, así que los lectores de pantalla no dependen de este tooltip visual. */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface-elevated px-2 py-1 text-xs text-fg opacity-0 shadow-popover transition-opacity duration-fast group-hover/tt:opacity-100 group-focus-within/tt:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
