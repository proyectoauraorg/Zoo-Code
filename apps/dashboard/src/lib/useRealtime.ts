"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook de tiempo real — conecta a /api/stream (SSE) y invalida
 * TanStack Query keys cuando el servidor emite cambios.
 * Fallback: si SSE falla, TanStack sigue con refetchInterval.
 */
export function useRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("changed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          entity: string;
        };
        qc.invalidateQueries({ queryKey: [data.entity] });
      } catch {
        // evento malformado, ignorar
      }
    });

    es.onerror = () => {
      // Fallback: cerrar y dejar que TanStack siga con polling
      es.close();
    };

    return () => es.close();
  }, [qc]);
}
