// Repository Pattern — contratos de persistencia (ADR-8).
// Todos los métodos son async (SQLite envuelve síncronos en Promise.resolve).
// DB_DRIVER selecciona el driver: "sqlite" (default) o "postgres".

import type {
  BusFactorData,
  ContributorStats,
  GithubSnapshot,
  HealthResponse,
  KanbanColumn,
  MetricPoint,
  PrCardData,
  PrEvent,
  SearchResponse,
  StateSnapshot,
} from "@/lib/types";

// ── Contexto de request (observabilidad) ──
export interface RepoContext {
  requestId: string; // UUID, para correlación
  now: Date;         // timestamp del request, inyectado
}
// makeRepos(ctx) permite que V2.e/V2.h inyecten trace/correlation IDs.

// ── Métricas del repo ──
export interface MetricRepo {
  getMetricSeries(days: number, ctx?: RepoContext): Promise<MetricPoint[]>;
  getMergedThisWeek(ctx?: RepoContext): Promise<number>;
}

// ── PRs ──
export interface PrRepo {
  getColumnEntryTimes(ctx?: RepoContext): Promise<Map<number, string>>;
  getKanbanData(ctx?: RepoContext): Promise<{ columns: KanbanColumn[]; prs: PrCardData[] }>;
}

// ── Eventos / Feed ──
export interface EventRepo {
  getRecentEvents(limit: number, ctx?: RepoContext): Promise<PrEvent[]>;
}

// ── Contributors ──
export interface ContributorRepo {
  getContributors(ctx?: RepoContext): Promise<ContributorStats[]>;
  getOpenPrsByAuthor(ctx?: RepoContext): Promise<Map<string, { count: number; ciFailing: number; conflicts: number }>>;
  getCycleTimes(ctx?: RepoContext): Promise<Array<{ login: string; cycle_hours: number }>>;
  getBusFactor(ctx?: RepoContext): Promise<BusFactorData>;
}

// ── Discord ──
export interface DiscordRepo {
  getByChannel(limit: number, ctx?: RepoContext): Promise<Array<{ channel: string; count: number }>>;
  getByUser(limit: number, ctx?: RepoContext): Promise<Array<{ user: string; count: number }>>;
  getSeries(days: number, ctx?: RepoContext): Promise<Array<{ date: string; count: number }>>;
  getLastActivity(ctx?: RepoContext): Promise<string | null>;
  getTotal(ctx?: RepoContext): Promise<number>;
}

// ── Snapshots (estado actual) ──
export interface SnapshotRepo {
  readGithub(ctx?: RepoContext): Promise<GithubSnapshot | null>;
  readState(ctx?: RepoContext): Promise<StateSnapshot | null>;
  readGithubHealth(ctx?: RepoContext): Promise<{ ok: boolean; fetchedAt: string | null } | null>;
  readDiscord(ctx?: RepoContext): Promise<import("@/lib/snapshots").DiscordSnapshot | null>;
  search(q: string, limit: number, ctx?: RepoContext): Promise<SearchResponse>;
}

// ── Health ──
export interface HealthRepo {
  getHealth(ctx?: RepoContext): Promise<HealthResponse>;
  // EXTENSIBLE: V2.d.3 añadirá getDbHealth(), getSnapshotHealth(),
  // getHistorianHealth(), getApiHealth(), getResourceHealth(),
  // getSystemHealth(). V2.e podrá añadir getRealtimeHealth(), etc.
}

// ── Repositorio completo ──
export interface Repos {
  metric: MetricRepo;
  pr: PrRepo;
  event: EventRepo;
  contributor: ContributorRepo;
  discord: DiscordRepo;
  snapshot: SnapshotRepo;
  health: HealthRepo;
}
