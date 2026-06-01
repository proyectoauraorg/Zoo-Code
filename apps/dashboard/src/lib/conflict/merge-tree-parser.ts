// Parser de la salida de git merge-tree (V2.i).
// Extrae los paths de archivos que tienen conflictos.
// Spec §2.5 y §8.2.

/** Regex para extraer paths de conflictos de tipo "CONFLICT (content): Merge conflict in <path>" */
const CONFLICT_RE = /CONFLICT\s*\(.*?\):\s*Merge conflict in\s+(.+)/gm;

/** Regex para extraer paths de "changed in both" con base/our/their */
const CHANGED_BOTH_RE = /changed in both\s*\n\s+base\s+\d+\s+\S+\s+(.+)/gm;

/**
 * Parsea la salida de `git merge-tree` y devuelve los paths de archivos en conflicto.
 * Deduplica y ordena alfabéticamente.
 *
 * @param output - Texto crudo de la salida de `git merge-tree`
 * @returns Lista ordenada de paths únicos en conflicto
 */
export function parseMergeTreeOutput(output: string): string[] {
  const paths = new Set<string>();

  for (const match of output.matchAll(CONFLICT_RE)) {
    const p = match[1]?.trim();
    if (p) paths.add(p);
  }

  for (const match of output.matchAll(CHANGED_BOTH_RE)) {
    const p = match[1]?.trim();
    if (p) paths.add(p);
  }

  return [...paths].sort();
}

/**
 * Normaliza un path de archivo a una "zona".
 * Regla (spec §4.1): si tiene ≥2 segmentos con un segundo "/" después del
 * primer nivel, toma hasta el segundo segmento. Si solo tiene un "/", toma
 * el primer segmento. Si no tiene "/", devuelve "(root)".
 *
 * Ejemplos:
 *   "src/lib/db.ts" → "src/lib"
 *   "src/app/api/conflicts/route.ts" → "src/app"
 *   "ingest/historian.py" → "ingest"
 *   "package.json" → "(root)"
 */
export function normalizeZone(filePath: string): string {
  const firstSlash = filePath.indexOf("/");
  if (firstSlash === -1) return "(root)";

  const afterFirst = filePath.substring(firstSlash + 1);
  const secondSlash = afterFirst.indexOf("/");

  if (secondSlash === -1) {
    // No hay segundo "/" → solo el primer segmento
    return filePath.substring(0, firstSlash);
  }

  // Hay segundo "/" → tomar hasta el segundo segmento (inclusive)
  return filePath.substring(0, firstSlash + 1 + secondSlash);
}

/**
 * Clasifica un risk score (0–100) en un nivel de riesgo.
 * Spec §5.2: 0-25 low, 26-50 medium, 51-75 high, 76-100 critical.
 *
 * @param score - Risk score compuesto (0–100)
 * @returns Nivel de riesgo
 */
export function classifyRisk(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 76) return "critical";
  if (score >= 51) return "high";
  if (score >= 26) return "medium";
  return "low";
}
