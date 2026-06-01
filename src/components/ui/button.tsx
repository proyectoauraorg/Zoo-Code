import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-fast focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-fg hover:opacity-90",
        outline: "border border-line bg-surface text-fg hover:bg-surface-muted",
        ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg",
      },
      size: {
        default: "h-9 px-3 text-sm",
        sm: "h-8 px-2.5 text-xs",
        icon: "h-9 w-9 text-base",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
