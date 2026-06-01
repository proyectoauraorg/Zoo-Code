import * as React from "react";

import { cn } from "@/lib/utils";

/** Superficie base de la consola (token-based). Reemplaza al Card de Tremor para
 *  superficies que no son charts. El padding lo decide el consumidor. */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export { Card };
