"use client";

import { SparkAreaChart } from "@tremor/react";

import { Card } from "@/components/ui/card";
import type { DiscordSeriesPoint } from "@/lib/types";

/** Gráfica de actividad Discord por día (Tremor sparkline). */
export function DiscordChart({ series }: { series: DiscordSeriesPoint[] }) {
  const total = series.reduce((s, p) => s + p.count, 0);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-fg-muted">Mensajes por día</p>
          <p className="text-2xl font-semibold tabular-nums text-fg">
            {total}
          </p>
        </div>
        {series.length > 1 ? (
          <SparkAreaChart
            data={series}
            index="date"
            categories={["count"]}
            colors={["violet"]}
            className="h-12 w-40"
          />
        ) : (
          <span className="text-xs text-fg-subtle">
            historizando… (1 punto)
          </span>
        )}
      </div>
    </Card>
  );
}
