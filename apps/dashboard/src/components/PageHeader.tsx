/** Descripción corta de la vista. El título de sección y el estado del snapshot viven
 *  en el header operacional global (AppHeader). */
export function PageHeader({ subtitle }: { subtitle?: string }) {
  if (!subtitle) return null;
  return <p className="-mt-2 mb-6 text-sm text-fg-muted">{subtitle}</p>;
}
