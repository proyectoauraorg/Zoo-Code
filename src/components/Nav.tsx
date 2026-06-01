"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_LINKS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Principal">
      {NAV_LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast",
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
  );
}
