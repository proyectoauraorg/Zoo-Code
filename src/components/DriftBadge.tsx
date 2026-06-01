import { Badge } from "@/components/ui/badge";
import type { Drift } from "@/lib/types";

/** Muestra el drift origin↔upstream como "↓behind ↑ahead". */
export function DriftBadge({ drift }: { drift: Drift | null }) {
  if (!drift) {
    return <Badge variant="outline">drift —</Badge>;
  }
  const variant =
    drift.behind > 0 ? "warning" : drift.ahead > 0 ? "info" : "success";
  return (
    <Badge variant={variant} title={`status: ${drift.status || "—"}`}>
      drift ↓{drift.behind} ↑{drift.ahead}
    </Badge>
  );
}
