import * as React from "react";

import { cn } from "@/lib/utils";

/** Estado vacío operacional: ícono opcional, título y descripción. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-2xl" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-fg-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
