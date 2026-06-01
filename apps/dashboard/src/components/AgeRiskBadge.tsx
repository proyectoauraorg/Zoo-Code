import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

interface AgeRiskEntry {
  prNumber: number;
  ageDays: number;
  fileCount: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

/**
 * Badge de nivel de riesgo (Age Risk).
 * Muestra el risk level con color correspondiente.
 * Spec §5.2.
 */
export function AgeRiskBadge({ risk }: { risk: AgeRiskEntry }) {
  const config = {
    low: { variant: "success" as const, icon: "🟢", label: "Bajo" },
    medium: { variant: "warning" as const, icon: "🟡", label: "Medio" },
    high: { variant: "danger" as const, icon: "🟠", label: "Alto" },
    critical: { variant: "danger" as const, icon: "🔴", label: "Crítico" },
  };
  const c = config[risk.riskLevel];

  return (
    <Tooltip
      label={`Score: ${risk.riskScore} · ${risk.ageDays.toFixed(1)}d · ${risk.fileCount} archivo(s)`}
    >
      <Badge variant={c.variant}>
        <span aria-hidden>{c.icon}</span>
        {c.label} ({risk.riskScore})
      </Badge>
    </Tooltip>
  );
}
