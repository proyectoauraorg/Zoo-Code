// Projector index — ejecuta todos los read model projectors.
// Llamar después de cada poll del historian (o periódicamente).

import { refreshContributorSummary } from "./contributor-summary";
import { refreshConflictLifecycle } from "./conflict-lifecycle";
import { refreshConflictTrajectory } from "./conflict-trajectory";
import { refreshSystemSnapshot } from "./system-snapshot";
import { projectConflictFiles } from "./conflict-file";
import { getDbWritable } from "@/lib/db";

export interface ProjectorResult {
  contributorSummary: number;
  conflictLifecycle: number;
  conflictTrajectory: number;
  systemSnapshot: number;
  conflictFiles: number; // V2.i: total de hotspots + heat + ageRisk proyectados
}

/**
 * Ejecuta todos los projectors y devuelve conteos.
 * Idempotente: cada projector hace DELETE + INSERT.
 *
 * F-12 fix: conflict_hotspot lo gestiona projectConflictFiles (V2.i)
 * con fallback V2.f interno. No se llama refreshConflictHotspot separado.
 */
export function runProjectors(): ProjectorResult {
  const result: ProjectorResult = {
    contributorSummary: refreshContributorSummary(),
    conflictLifecycle: refreshConflictLifecycle(),
    conflictTrajectory: refreshConflictTrajectory(),
    systemSnapshot: refreshSystemSnapshot(),
    conflictFiles: 0,
  };

  // V2.i: conflict-file projector (hotspots reales + heat + ageRisk).
  // Se ejecuta después de los otros projectors para tener conflict_lifecycle disponible.
  // Internamente hace fallback V2.f si conflict_file está vacío.
  const db = getDbWritable();
  if (db) {
    const cfResult = projectConflictFiles(db);
    result.conflictFiles =
      cfResult.hotspots + cfResult.heat + cfResult.ageRisk;
  }

  return result;
}

export {
  refreshContributorSummary,
  refreshConflictLifecycle,
  refreshConflictTrajectory,
  refreshSystemSnapshot,
  projectConflictFiles,
};
