// EventBus in-process (V2.e) — singleton que sobrevive hot-reload.
// Nivel 4 en jerarquía de verdad: efímero, acelerador de UI.

import { EventEmitter } from "node:events";

export interface ZooEventSignal {
  entity: "overview" | "prs" | "issues" | "contributors" | "discord" | "system";
  ids?: number[];
  ts: string;
}

class ZooEventBus extends EventEmitter {
  emitChange(data: ZooEventSignal): boolean {
    return this.emit("changed", data);
  }
}

const globalForBus = globalThis as unknown as { __zoodashBus?: ZooEventBus };
export const eventBus: ZooEventBus =
  globalForBus.__zoodashBus ?? new ZooEventBus();
globalForBus.__zoodashBus = eventBus;
