// Tipos del dominio ZooDash. "Estado actual" viene del snapshot vivo (github.json);
// "historia/tendencias/aging" vienen de la SQLite que rellena ingest/historian.py.

export interface CiStatus {
  state: "pass" | "fail" | "pending" | "none";
  passed: number;
  failed: number;
  pending: number;
}

export interface PrCurrent {
  number: number;
  title: string;
  url: string;
  state: string; // OPEN | MERGED | CLOSED
  author: string | null; // login del creador (si disponible en snapshot)
  reviewDecision: string; // '' | REVIEW_REQUIRED | CHANGES_REQUESTED | APPROVED
  mergeable: string; // MERGEABLE | CONFLICTING | UNKNOWN
  isDraft: boolean;
  ci: CiStatus;
  updatedAt: string;
}

export interface IssueCurrent {
  number: number;
  title: string;
  url: string;
  state: string; // OPEN | CLOSED
  labels: string[];
  assignee: string | null;
  milestone: string | null;
  updatedAt: string;
}

export interface Drift {
  ahead: number;
  behind: number;
  status: string;
}

export interface RawCounts {
  prOpen: number;
  prMerged: number;
  prClosed: number;
  prCiFailing: number;
  issues: number;
  mentions: number;
  subscriptions: number;
  notifsTotal: number;
}

export interface GithubSnapshot {
  fetchedAt: string;
  ok: boolean;
  summary: string;
  raw: RawCounts;
  prs: PrCurrent[];
  issues: IssueCurrent[];
  drift: Drift | null;
  release: string | null;
}

export interface StateSnapshot {
  deltas: string[];
  critical: string[];
  updatedAt: string;
}

export interface MetricPoint {
  date: string;
  prOpen: number;
  prCiFailing: number;
  issues: number;
}

export interface PrEvent {
  ts: string;
  number: number;
  kind: string;
  fromState: string | null;
  toState: string | null;
  detail: string | null;
}

// Respuestas de la API
export interface OverviewResponse {
  ok: boolean;
  stale: boolean; // true si no se pudo leer el snapshot vivo
  fetchedAt: string | null;
  raw: RawCounts | null;
  drift: Drift | null;
  release: string | null;
  mergedThisWeek: number;
  series: MetricPoint[];
  feed: string[];
  recentEvents: PrEvent[];
}

export interface PrCardData extends PrCurrent {
  column: KanbanColumn;
  agingDays: number | null; // días en la columna actual (de la DB); null si sin historia
}

export interface PrsResponse {
  ok: boolean;
  fetchedAt: string | null;
  columns: KanbanColumn[];
  prs: PrCardData[];
}

export interface IssuesResponse {
  ok: boolean;
  fetchedAt: string | null;
  issues: IssueCurrent[];
}

export interface HealthResponse {
  ok: boolean;
  fetchedAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
}

export type KanbanColumn =
  | "Draft"
  | "Review"
  | "Changes Requested"
  | "Approved"
  | "Merged";

// Command Palette — resultados de búsqueda
export interface SearchResult {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface ContributorResult {
  login: string;
  role: string;
}

export interface SearchResponse {
  ok: boolean;
  prs: SearchResult[];
  issues: SearchResult[];
  contributors: ContributorResult[];
}

// Contributor Analytics
export interface ContributorStats {
  login: string;
  prsOpened: number;
  prsMerged: number;
  prsClosed: number;
  prsOpen: number; // actualmente abiertos
  ciFailing: number; // PRs abiertos con CI roja
  conflicts: number; // PRs abiertos en conflicto
  cycleP50H: number | null; // mediana cycle-time en horas
  cycleP90H: number | null; // percentil 90 cycle-time en horas
  firstSeen: string;
  lastSeen: string;
}

export interface BusFactorData {
  factor: number;
  topAuthor: string;
  topSharePct: number;
  distribution: Array<{ login: string; total: number; sharePct: number }>;
}

export interface ContributorsResponse {
  ok: boolean;
  total: number;
  busFactor: BusFactorData;
  contributors: ContributorStats[];
}

// Discord Panel
export interface DiscordChannel {
  channel: string;
  count: number;
}

export interface DiscordUser {
  user: string;
  count: number;
}

export interface DiscordSeriesPoint {
  date: string;
  count: number;
}

export interface DiscordResponse {
  ok: boolean;
  fresh: boolean; // true si hay intake reciente
  lastIntake: string | null; // ISO ts del último dato
  totalMessages: number;
  byChannel: DiscordChannel[];
  byUser: DiscordUser[];
  series: DiscordSeriesPoint[];
}

// System Health (V2.d.3)
export interface SnapshotHealth {
  ageSeconds: number | null;
  ok: boolean;
}

export interface DbHealth {
  ok: boolean;
  latencyMs: number | null;
  driver: "sqlite" | "postgres";
}

export interface HistorianHealth {
  lastRunSecondsAgo: number | null;
  lagPolls: number;
}

export interface ApiHealth {
  requestsTotal: number;
  errorsTotal: number;
  errorRate: number;
  avgLatencyMs: number;
  perEndpoint: Record<string, { avgLatencyMs: number; requests: number; errors: number; errorRate: number }>;
}

export interface ResourceHealth {
  memoryMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  diskFreeMb: number | null;
  uptimeS: number;
}

export type SystemStatus = "healthy" | "degraded" | "critical";

export interface SystemHealthData {
  status: SystemStatus;
  snapshot: SnapshotHealth;
  database: DbHealth;
  historian: HistorianHealth;
  api: ApiHealth;
  resources: ResourceHealth;
  freshness: "ok" | "stale" | "critical";
  uptimeS: number;
}
