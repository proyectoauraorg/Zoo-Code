import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { relativeTime } from "@/lib/api";
import type { IssueCurrent } from "@/lib/types";

export function IssueTable({ issues }: { issues: IssueCurrent[] }) {
  if (issues.length === 0) {
    return (
      <EmptyState
        icon="🐛"
        title="Sin issues para este filtro"
        description="Prueba con otro estado o espera al próximo poll del runtime."
      />
    );
  }
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <TR>
            <TH className="w-16">#</TH>
            <TH>Título</TH>
            <TH>Estado</TH>
            <TH>Labels</TH>
            <TH>Asignado</TH>
            <TH className="text-right">Actualizado</TH>
          </TR>
        </THead>
        <TBody>
          {issues.map((iss) => (
            <TR key={iss.number}>
              <TD className="font-mono text-fg-subtle">#{iss.number}</TD>
              <TD className="max-w-md">
                <a
                  href={iss.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Issue #${iss.number}: ${iss.title} (abre en GitHub)`}
                  className="font-medium text-fg transition-colors duration-fast hover:text-brand hover:underline"
                >
                  {iss.title}
                </a>
              </TD>
              <TD>
                <Badge variant={iss.state === "OPEN" ? "success" : "default"}>
                  {iss.state}
                </Badge>
              </TD>
              <TD>
                {iss.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {iss.labels.map((l) => (
                      <Badge key={l} variant="outline">
                        {l}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
              </TD>
              <TD className="text-fg-muted">
                {iss.assignee ?? <span className="text-fg-subtle">—</span>}
              </TD>
              <TD className="text-right text-fg-muted">
                {relativeTime(iss.updatedAt)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
