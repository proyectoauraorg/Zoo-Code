import { Button } from "@/components/ui/button";

/** Estado de error operacional: copy técnico + acción de reintento. role=alert. */
export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-danger">
        <span aria-hidden>⚠</span>
        {title}
      </div>
      {detail ? (
        <p className="font-mono text-xs text-fg-muted">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <span aria-hidden>↻</span> Reintentar
        </Button>
      ) : null}
    </div>
  );
}
