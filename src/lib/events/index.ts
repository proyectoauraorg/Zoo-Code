// Events module index — exports públicos del Event Model v1.0.

export { eventBus } from "./event-bus";
export type { ZooEventSignal } from "./event-bus";
export { makeEventId } from "./event-id";
export { persistAndEmit } from "./persist-and-emit";
export { startProjectionListener } from "./projection-listener";
export type {
  ZooEvent,
  EventBase,
  PrNewEvent,
  PrMergedEvent,
  PrStateChangeEvent,
  PrCiRedEvent,
  PrCiGreenEvent,
  PrConflictEvent,
  IssueNewEvent,
  IssueClosedEvent,
  SystemPollCompletedEvent,
} from "./types";
