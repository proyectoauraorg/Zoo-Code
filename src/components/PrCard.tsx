import { AgingBadge } from "@/components/AgingBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { relativeTime } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CiStatus, PrCardData } from "@/lib/types";

function ciLabel(ci: CiStatus): string {
  if (ci.state === "fail")
    return `CI fallando — ${ci.passed} ✓ / ${ci.failed} ✗`;
  if (ci.state === "pass") return "CI en verde";
  if (ci.state === "pending") return `CI pendiente — ${ci.pending} en curso`;
  return "Sin CI";
}

function CiBadge({ ci }: { ci: CiStatus }) {
  if (ci.state === "fail") {
    return (
      <Badge variant="danger">
        <span aria-hidden>🔴</span>
        <span className="tabular-nums">
          {ci.passed}/{ci.passed + ci.failed}
        </span>
        <span className="sr-only">CI fallando</span>
      </Badge>
    );
  }
  if (ci.state === "pass")
    return (
      <Badge variant="success">
        <span aria-hidden>🟢</span> CI<span className="sr-only"> en verde</span>
      </Badge>
    );
  if (ci.state === "pending")
    return (
      <Badge variant="warning">
        <span aria-hidden>🟡</span> CI<span className="sr-only"> pendiente</span>
      </Badge>
    );
  return <Badge variant="outline">CI —</Badge>;
}

export function PrCard({ pr }: { pr: PrCardData }) {
  const isBottleneck =
    pr.ci.state === "fail" ||
    pr.mergeable === "CONFLICTING" ||
    (pr.agingDays ?? 0) >= 7;

  return (
    <Card
      className={cn(
        "p-3 transition-shadow duration-fast",
        isBottleneck && "ring-1 ring-danger",
      )}
    >
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`PR #${pr.number}: ${pr.title} (abre en GitHub)`}
        className="block text-sm font-medium text-fg transition-colors duration-fast hover:text-brand hover:underline"
      >
        <span className="font-mono text-fg-subtle">#{pr.number}</span>{" "}
        {pr.title}
      </a>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Tooltip label={ciLabel(pr.ci)}>
          <CiBadge ci={pr.ci} />
        </Tooltip>
        {pr.mergeable === "CONFLICTING" ? (
          <Tooltip label="El PR tiene conflictos con la rama base">
            <Badge variant="warning">
              <span aria-hidden>⚠</span> conflict
            </Badge>
          </Tooltip>
        ) : null}
        <AgingBadge days={pr.agingDays} />
      </div>
      <p className="mt-1.5 text-[11px] text-fg-subtle">
        actualizado {relativeTime(pr.updatedAt)}
      </p>
    </Card>
  );
}
