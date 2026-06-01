// Event Model v1.0 — discriminated union de tipos de eventos ZooDash.

export interface EventBase {
  event_id: string;
  schema_version: number;
  ts: string;
  source: "historian" | "backfill" | "manual";
  correlation_id?: string;   // V2.h: agrupa eventos del mismo poll/batch
  causation_id?: string | null; // V2.h: qué evento causó este (null = root)
}

export interface PrNewEvent extends EventBase {
  type: "pr.new";
  entity: { kind: "pr"; ref: string };
  payload: { number: number; title: string; author: string | null };
}

export interface PrMergedEvent extends EventBase {
  type: "pr.merged";
  entity: { kind: "pr"; ref: string };
  payload: { number: number; mergedAt: string; cycleTimeH: number | null };
}

export interface PrStateChangeEvent extends EventBase {
  type: "pr.state_changed";
  entity: { kind: "pr"; ref: string };
  payload: { number: number; from: string; to: string };
}

export interface PrCiRedEvent extends EventBase {
  type: "pr.ci_red";
  entity: { kind: "pr"; ref: string };
  payload: { number: number; failed: number };
}

export interface PrCiGreenEvent extends EventBase {
  type: "pr.ci_green";
  entity: { kind: "pr"; ref: string };
  payload: { number: number };
}

export interface PrConflictEvent extends EventBase {
  type: "pr.conflict";
  entity: { kind: "pr"; ref: string };
  payload: { number: number };
}

export interface PrConflictResolvedEvent extends EventBase {
  type: "pr.conflict_resolved";
  entity: { kind: "pr"; ref: string };
  payload: { number: number };
}

export interface IssueNewEvent extends EventBase {
  type: "issue.new";
  entity: { kind: "issue"; ref: string };
  payload: { number: number; title: string };
}

export interface IssueClosedEvent extends EventBase {
  type: "issue.closed";
  entity: { kind: "issue"; ref: string };
  payload: { number: number };
}

export interface SystemPollCompletedEvent extends EventBase {
  type: "system.poll_completed";
  entity: { kind: "system"; ref: "poll" };
  payload: { prs: number; issues: number; events: number };
}

export type ZooEvent =
  | PrNewEvent
  | PrMergedEvent
  | PrStateChangeEvent
  | PrCiRedEvent
  | PrCiGreenEvent
  | PrConflictEvent
  | PrConflictResolvedEvent
  | IssueNewEvent
  | IssueClosedEvent
  | SystemPollCompletedEvent;
