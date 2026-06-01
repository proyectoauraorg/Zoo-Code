import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Skeleton de carga del Overview (KPIs + sparkline + feed). */
export function OverviewSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando overview">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {range(4).map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="space-y-2 p-4 lg:col-span-2">
          {range(5).map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}

/** Skeleton de carga del PR Board (5 columnas con tarjetas). */
export function KanbanSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
      role="status"
      aria-label="Cargando PR Board"
    >
      {range(5).map((c) => (
        <div
          key={c}
          className="space-y-2 rounded-lg border border-line bg-surface-muted p-2"
        >
          <Skeleton className="h-5 w-24" />
          {range(3).map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton de carga de la tabla de Issues. */
export function TableSkeleton() {
  return (
    <Card className="space-y-3 p-4" role="status" aria-label="Cargando issues">
      {range(6).map((i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </Card>
  );
}
