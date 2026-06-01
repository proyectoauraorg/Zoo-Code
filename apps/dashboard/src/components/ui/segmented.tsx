"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
}

/** Control segmentado (tabs) accesible para filtros densos. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "rounded px-3 py-1 text-sm font-medium transition-colors duration-fast",
              active
                ? "bg-brand text-brand-fg"
                : "text-fg-muted hover:bg-surface-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
