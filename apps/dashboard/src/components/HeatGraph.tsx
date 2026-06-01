interface HeatZoneEntry {
  zone: string;
  fileCount: number;
  conflictCount: number;
  score: number; // 0–1
}

/**
 * Heat Graph — visualización de zonas con barras proporcionales.
 * Spec §4.3.
 */
export function HeatGraph({ heat }: { heat: HeatZoneEntry[] }) {
  if (heat.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-fg">
        🔥 Conflict Heat — zonas del repo
      </h3>
      <div className="space-y-1.5">
        {heat.map((z) => (
          <div key={z.zone} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 font-mono text-xs text-fg truncate">
              {z.zone}
            </span>
            <div className="flex-1 h-4 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(z.score * 100, 2)}%`,
                  backgroundColor:
                    z.score >= 0.75
                      ? "var(--color-danger)"
                      : z.score >= 0.5
                        ? "var(--color-warning)"
                        : z.score >= 0.25
                          ? "var(--color-info)"
                          : "var(--color-success)",
                }}
              />
            </div>
            <span className="w-20 text-right text-xs tabular-nums text-fg-muted">
              {z.fileCount} archivo{z.fileCount !== 1 ? "s" : ""}
            </span>
            <span className="w-16 text-right text-xs tabular-nums text-fg-muted">
              {z.conflictCount} cflt{z.conflictCount !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
