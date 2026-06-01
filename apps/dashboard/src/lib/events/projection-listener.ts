// Projection listener — dispara projectors cuando llegan eventos al EventBus.
// Debounce de 1s para no disparar por cada evento individual.

import { eventBus } from "./event-bus";
import { runProjectors } from "@/lib/projector";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startProjectionListener() {
  eventBus.on("changed", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runProjectors();
      debounceTimer = null;
    }, 1000);
  });
}
