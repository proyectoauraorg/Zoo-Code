import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/api";
import type { PrEvent } from "@/lib/types";

const EVENT_EMOJI: Record<string, string> = {
  new: "🆕",
  merged: "✅",
  closed: "🚫",
  state_change: "↪️",
  ci_red: "🔴",
  ci_green: "🟢",
  conflict: "⚠️",
  resolved: "🔧",
};

function eventLine(e: PrEvent): string {
  const emoji = EVENT_EMOJI[e.kind] ?? "•";
  const transition =
    e.fromState && e.toState ? ` (${e.fromState} → ${e.toState})` : "";
  return `${emoji} PR #${e.number} ${e.kind}${transition}`;
}

export function ActivityFeed({
  feed,
  events,
}: {
  feed: string[];
  events: PrEvent[];
}) {
  const hasFeed = feed.length > 0;
  const hasEvents = events.length > 0;

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-fg">Actividad reciente</h2>
      {!hasFeed && !hasEvents ? (
        <p className="text-sm text-fg-subtle">Sin novedades.</p>
      ) : null}

      {hasFeed ? (
        <ul className="space-y-1.5">
          {feed.slice(0, 15).map((line, i) => (
            <li key={`d-${i}`} className="text-sm leading-snug text-fg-muted">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {hasEvents ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Transiciones historizadas
          </p>
          <ul className="space-y-1.5">
            {events.slice(0, 10).map((e, i) => (
              <li
                key={`e-${i}`}
                className="flex items-baseline justify-between gap-2 text-sm text-fg-muted"
              >
                <span className="truncate">{eventLine(e)}</span>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {relativeTime(e.ts)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
