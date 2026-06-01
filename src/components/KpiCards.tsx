import { Card } from "@/components/ui/card";
import type { RawCounts } from "@/lib/types";

interface Kpi {
  label: string;
  value: number;
  hint?: string;
  tone: "neutral" | "good" | "warn" | "bad";
  emoji: string;
}

const TONE: Record<Kpi["tone"], string> = {
  neutral: "text-fg",
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
};

export function KpiCards({
  raw,
  mergedThisWeek,
}: {
  raw: RawCounts;
  mergedThisWeek: number;
}) {
  const kpis: Kpi[] = [
    { label: "PRs abiertos", value: raw.prOpen, tone: "neutral", emoji: "🔀" },
    {
      label: "PRs mergeados",
      value: raw.prMerged,
      hint: `${mergedThisWeek} esta semana`,
      tone: "good",
      emoji: "✅",
    },
    { label: "Issues abiertas", value: raw.issues, tone: "neutral", emoji: "🐛" },
    {
      label: "PRs con CI roja",
      value: raw.prCiFailing,
      tone: raw.prCiFailing > 0 ? "bad" : "good",
      emoji: raw.prCiFailing > 0 ? "🔴" : "🟢",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg-muted">{k.label}</p>
            <span aria-hidden>{k.emoji}</span>
          </div>
          <p
            className={`mt-1 text-3xl font-semibold tabular-nums ${TONE[k.tone]}`}
          >
            {k.value}
          </p>
          {k.hint ? (
            <p className="mt-0.5 text-xs text-fg-subtle">{k.hint}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
