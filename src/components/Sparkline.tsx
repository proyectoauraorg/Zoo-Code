"use client";

import { SparkAreaChart } from "@tremor/react";

import { Card } from "@/components/ui/card";
import type { MetricPoint } from "@/lib/types";

/** Sparkline de PRs abiertos a lo largo del tiempo (serie del historian). */
export function Sparkline({ series }: { series: MetricPoint[] }) {
  const last = series.at(-1);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-fg-muted">PRs abiertos (tendencia)</p>
          <p className="text-2xl font-semibold tabular-nums text-fg">
            {last?.prOpen ?? "—"}
          </p>
        </div>
        {series.length > 1 ? (
          <SparkAreaChart
            data={series}
            index="date"
            categories={["prOpen"]}
            colors={["blue"]}
            className="h-12 w-40"
          />
        ) : (
          <span className="text-xs text-fg-subtle">historizando… (1 punto)</span>
        )}
      </div>
    </Card>
  );
}
