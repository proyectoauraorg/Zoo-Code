import { cn } from "@/lib/utils";

/** Placeholder de carga con shimmer. El movimiento se anula bajo
 *  prefers-reduced-motion (globals.css), quedando como bloque estático. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-muted",
        className,
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}
