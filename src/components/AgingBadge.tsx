import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

/** Días en la columna actual; vira a ámbar/rojo según envejece. */
export function AgingBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const variant = days >= 7 ? "danger" : days >= 3 ? "warning" : "outline";
  return (
    <Tooltip label={`${days} día(s) en la columna actual`}>
      <Badge variant={variant}>
        <span aria-hidden>🕒</span> {days}d
        <span className="sr-only"> días en la columna actual</span>
      </Badge>
    </Tooltip>
  );
}
