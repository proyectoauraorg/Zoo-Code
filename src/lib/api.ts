// Helpers de cliente para consumir /api/* con TanStack Query.

export const POLL_REFRESH_MS =
  (Number(process.env.NEXT_PUBLIC_POLL_REFRESH_SECONDS) || 60) * 1000;

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** "hace 3h", "hace 2d", "ahora" — formato relativo en español a partir de un ISO. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "ahora";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}
