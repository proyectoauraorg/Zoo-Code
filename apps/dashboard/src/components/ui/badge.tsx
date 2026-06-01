import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-fast",
  {
    variants: {
      variant: {
        default: "border-line bg-surface-muted text-fg-muted",
        success: "border-transparent bg-success-bg text-success",
        merged: "border-transparent bg-merged-bg text-merged",
        danger: "border-transparent bg-danger-bg text-danger",
        warning: "border-transparent bg-warning-bg text-warning",
        info: "border-transparent bg-info-bg text-info",
        draft: "border-transparent bg-draft-bg text-draft",
        outline: "border-line text-fg-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
