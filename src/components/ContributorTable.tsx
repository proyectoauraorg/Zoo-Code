import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { relativeTime } from "@/lib/api";
import type { ContributorStats } from "@/lib/types";

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 24) return `${Math.round(h)}h`;
  const days = h / 24;
  if (days < 7) return `${Math.round(days)}d`;
  const weeks = days / 7;
  return `${Math.round(weeks * 10) / 10}w`;
}

function CycleBadge({ p50, p90 }: { p50: number | null; p90: number | null }) {
  if (p50 === null)
    return <span className="text-xs text-fg-subtle">sin datos</span>;
  const variant = p50 > 168 ? "danger" : p50 > 72 ? "warning" : "outline";
  return (
    <Tooltip label={`p50: ${formatHours(p50)} · p90: ${formatHours(p90)}`}>
      <Badge variant={variant}>{formatHours(p50)}</Badge>
    </Tooltip>
  );
}

export function ContributorTable({
  contributors,
}: {
  contributors: ContributorStats[];
}) {
  if (contributors.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="Sin contribuidores detectados"
        description="Ejecuta el backfill de autores o espera a que el runtime emita el campo actor en los PRs."
      />
    );
  }

  const totalPrs = contributors.reduce(
    (sum, c) => sum + c.prsOpened + c.prsMerged + c.prsClosed,
    0,
  );

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TR>
            <TH>Login</TH>
            <TH className="text-center">Abiertos</TH>
            <TH className="text-center">Mergeados</TH>
            <TH className="text-center">Cerrados</TH>
            <TH className="text-center">CI 🔴</TH>
            <TH className="text-center">Conflicto</TH>
            <TH className="text-center">Cycle-time</TH>
            <TH className="text-center">Cuota</TH>
            <TH className="text-right">Último visto</TH>
          </TR>
        </THead>
        <TBody>
          {contributors.map((c) => {
            const total = c.prsOpened + c.prsMerged + c.prsClosed;
            const share =
              totalPrs > 0 ? Math.round((total / totalPrs) * 100) : 0;
            return (
              <TR key={c.login}>
                <TD>
                  <a
                    href={`https://github.com/${c.login}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-fg transition-colors duration-fast hover:text-brand hover:underline"
                  >
                    {c.login}
                  </a>
                </TD>
                <TD className="text-center tabular-nums">
                  {c.prsOpen > 0 ? (
                    <Badge variant="info">{c.prsOpen}</Badge>
                  ) : (
                    <span className="text-fg-subtle">0</span>
                  )}
                </TD>
                <TD className="text-center tabular-nums text-success">
                  {c.prsMerged || (
                    <span className="text-fg-subtle">0</span>
                  )}
                </TD>
                <TD className="text-center tabular-nums text-fg-muted">
                  {c.prsClosed || (
                    <span className="text-fg-subtle">0</span>
                  )}
                </TD>
                <TD className="text-center">
                  {c.ciFailing > 0 ? (
                    <Badge variant="danger">{c.ciFailing}</Badge>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </TD>
                <TD className="text-center">
                  {c.conflicts > 0 ? (
                    <Badge variant="warning">{c.conflicts}</Badge>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </TD>
                <TD className="text-center">
                  <CycleBadge p50={c.cycleP50H} p90={c.cycleP90H} />
                </TD>
                <TD className="text-center">
                  <span className="text-xs tabular-nums text-fg-muted">
                    {share}%
                  </span>
                </TD>
                <TD className="text-right text-xs text-fg-muted">
                  {relativeTime(c.lastSeen)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
