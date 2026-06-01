import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { withMetrics } from "@/lib/api-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ConflictFileEntry {
  path: string;
  detectedAt: string;
  resolvedAt: string | null;
}

interface ConflictEntry {
  prNumber: number;
  title: string;
  state: string;
  detectedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  files: ConflictFileEntry[];       // V2.i
  ageRisk: AgeRiskEntry | null;     // V2.i
}

interface HotspotEntry {
  path: string;          // ruta real (V2.i) o PR#N (V2.f fallback)
  times: number;
  lastSeen: string;
}

interface HeatZoneEntry {
  zone: string;
  fileCount: number;
  conflictCount: number;
  score: number;          // 0–1
}

interface AgeRiskEntry {
  prNumber: number;
  ageDays: number;
  fileCount: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface ConflictsResponse {
  ok: boolean;
  open: ConflictEntry[];
  resolved: ConflictEntry[];
  hotspots: HotspotEntry[];
  heat: HeatZoneEntry[];            // V2.i
  ageRisk: AgeRiskEntry[];          // V2.i
}

export const GET = withMetrics(async () => {
  const db = getDb();
  if (!db) {
    return NextResponse.json({
      ok: false,
      open: [],
      resolved: [],
      hotspots: [],
      heat: [],
      ageRisk: [],
    } satisfies ConflictsResponse);
  }

  // Conflictos abiertos (actuales)
  const open = db
    .prepare(
      `SELECT pr_number, title, detected_at, resolved_at, duration_seconds
       FROM conflict_lifecycle
       WHERE state = 'entered'
       ORDER BY detected_at DESC`,
    )
    .all() as Array<{
    pr_number: number;
    title: string;
    detected_at: string;
    resolved_at: string | null;
    duration_seconds: number | null;
  }>;

  // Últimos conflictos resueltos
  const resolved = db
    .prepare(
      `SELECT pr_number, title, detected_at, resolved_at, duration_seconds
       FROM conflict_lifecycle
       WHERE state = 'resolved'
       ORDER BY resolved_at DESC
       LIMIT 20`,
    )
    .all() as typeof open;

  // Archivos por conflicto (V2.i)
  const filesByPr = new Map<number, ConflictFileEntry[]>();
  try {
    const fileRows = db
      .prepare(
        `SELECT cf.pr_number, cf.file_path, cf.detected_at, cf.resolved_at
         FROM conflict_file cf
         JOIN conflict_lifecycle cl ON cl.id = cf.conflict_id
         WHERE cl.state = 'entered'
         ORDER BY cf.detected_at`,
      )
      .all() as Array<{
      pr_number: number;
      file_path: string;
      detected_at: string;
      resolved_at: string | null;
    }>;

    for (const f of fileRows) {
      const existing = filesByPr.get(f.pr_number);
      const entry: ConflictFileEntry = {
        path: f.file_path,
        detectedAt: f.detected_at,
        resolvedAt: f.resolved_at,
      };
      if (existing) {
        existing.push(entry);
      } else {
        filesByPr.set(f.pr_number, [entry]);
      }
    }
  } catch {
    // conflict_file table might not exist yet — degrade gracefully
  }

  // Age risk por PR (V2.i)
  const ageRiskMap = new Map<number, AgeRiskEntry>();
  try {
    const ageRiskRows = db
      .prepare(
        `SELECT pr_number, age_days, file_count, risk_score, risk_level
         FROM conflict_age_risk
         ORDER BY risk_score DESC`,
      )
      .all() as Array<{
      pr_number: number;
      age_days: number;
      file_count: number;
      risk_score: number;
      risk_level: string;
    }>;

    for (const ar of ageRiskRows) {
      ageRiskMap.set(ar.pr_number, {
        prNumber: ar.pr_number,
        ageDays: Math.round(ar.age_days * 10) / 10,
        fileCount: ar.file_count,
        riskScore: ar.risk_score,
        riskLevel: ar.risk_level as AgeRiskEntry["riskLevel"],
      });
    }
  } catch {
    // conflict_age_risk table might not exist yet — degrade gracefully
  }

  // Hotspots V2.i: conflict_hotspot (paths reales o PR#N fallback)
  let hotspots: HotspotEntry[] = [];
  try {
    const hotspotRows = db
      .prepare(
        `SELECT path, times, last_seen
         FROM conflict_hotspot
         ORDER BY times DESC
         LIMIT 20`,
      )
      .all() as Array<{
      path: string;
      times: number;
      last_seen: string;
    }>;

    hotspots = hotspotRows.map((h) => ({
      path: h.path,
      times: h.times,
      lastSeen: h.last_seen,
    }));
  } catch {
    // conflict_hotspot might not have V2.i schema — degrade gracefully
  }

  // Heat zones (V2.i)
  let heat: HeatZoneEntry[] = [];
  try {
    const heatRows = db
      .prepare(
        `SELECT zone, file_count, conflict_count, score
         FROM conflict_heat
         ORDER BY conflict_count DESC`,
      )
      .all() as Array<{
      zone: string;
      file_count: number;
      conflict_count: number;
      score: number;
    }>;

    heat = heatRows.map((h) => ({
      zone: h.zone,
      fileCount: h.file_count,
      conflictCount: h.conflict_count,
      score: h.score,
    }));
  } catch {
    // conflict_heat table might not exist yet — degrade gracefully
  }

  // Age risk list (V2.i)
  const ageRisk = [...ageRiskMap.values()].sort(
    (a, b) => b.riskScore - a.riskScore,
  );

  const mapEntry = (r: typeof open[number]): ConflictEntry => ({
    prNumber: r.pr_number,
    title: r.title,
    state: "entered",
    detectedAt: r.detected_at,
    resolvedAt: r.resolved_at,
    durationSeconds: r.duration_seconds,
    files: filesByPr.get(r.pr_number) ?? [],
    ageRisk: ageRiskMap.get(r.pr_number) ?? null,
  });

  const body: ConflictsResponse = {
    ok: true,
    open: open.map(mapEntry),
    resolved: resolved.map((r) => ({ ...mapEntry(r), state: "resolved" })),
    hotspots,
    heat,
    ageRisk,
  };

  return NextResponse.json(body);
});
