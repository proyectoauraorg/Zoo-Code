/**
 * Genera un event_id determinista para dedupe.
 * Formato: "{source}:{entity_kind}:{entity_ref}:{type}:{ts}"
 */
export function makeEventId(
  source: string,
  entityKind: string,
  entityRef: string,
  type: string,
  ts: string,
): string {
  return `${source}:${entityKind}:${entityRef}:${type}:${ts}`;
}
