import { Badge } from "@/components/ui/badge";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";

interface HotspotEntry {
  path: string;
  times: number;
  lastSeen: string;
}

/** Badge de nivel de riesgo (Age Risk). Spec §5.2. */
function RiskLevelBadge({
  level,
}: {
  level: "low" | "medium" | "high" | "critical";
}) {
  const config = {
    low: { variant: "success" as const, label: "Bajo" },
    medium: { variant: "warning" as const, label: "Medio" },
    high: { variant: "danger" as const, label: "Alto" },
    critical: { variant: "danger" as const, label: "Crítico" },
  };
  const c = config[level];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

/** Tabla de hotspots con paths reales (V2.i). */
export function ConflictFileTable({
  hotspots,
}: {
  hotspots: HotspotEntry[];
}) {
  if (hotspots.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-fg">
        📁 Hotspots — archivos en conflicto
      </h3>
      <Table>
        <THead>
          <TR>
            <TH>Archivo / PR</TH>
            <TH className="text-center">Conflictos</TH>
            <TH className="text-right">Último</TH>
          </TR>
        </THead>
        <TBody>
          {hotspots.map((h) => (
            <TR key={h.path}>
              <TD className="font-mono text-xs text-fg">{h.path}</TD>
              <TD className="text-center">
                <Badge variant={h.times >= 3 ? "danger" : "warning"}>
                  {h.times}
                </Badge>
              </TD>
              <TD className="text-right text-xs text-fg-muted">{h.lastSeen}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export { RiskLevelBadge };
