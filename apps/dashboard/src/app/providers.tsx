"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { useRealtime } from "@/lib/useRealtime";

/** Componente puente que conecta SSE a TanStack Query. */
function RealtimeBridge() {
  useRealtime();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 10_000,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <RealtimeBridge />
      {children}
    </QueryClientProvider>
  );
}
