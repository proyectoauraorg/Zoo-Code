"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Error boundary de vista (App Router): captura errores de render y ofrece reintentar. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-2">
      <ErrorState
        title="Algo falló al renderizar esta vista"
        detail={error.message}
        onRetry={reset}
      />
    </div>
  );
}
