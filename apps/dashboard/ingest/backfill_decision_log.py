#!/usr/bin/env python3
"""
Backfill script for decision_log (V2.h).

Re-evalúa las reglas de alerting contra el event_log completo
y genera decision_log para el historial. Idempotente: DELETE + replay.

Uso:
  python3 ingest/backfill_decision_log.py [--db path/to/zoodash.db]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# Pesos del modelo de presión (alineados con conflict-trajectory.ts)
W_CONFLICT_COUNT = 1.0
W_ACTIVE_STREAK = 1.8
W_COOLDOWN_BREACHES = 2.5
W_DURATION_MEAN_DIVISOR = 3600
COOLDOWN_WINDOW_S = 24 * 3600  # 24 horas


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_ts(ts_str: str) -> float:
    """Parse ISO timestamp to epoch ms."""
    ts_clean = ts_str
    if "+" not in ts_str and "Z" in ts_str:
        ts_clean = ts_str.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(ts_clean).timestamp() * 1000
    except (ValueError, TypeError):
        return 0.0


def compute_pressure(
    conflict_count: int,
    active_streak: int,
    cooldown_breaches: int,
    duration_mean_s: float | None,
) -> float:
    duration_h = (
        (duration_mean_s / W_DURATION_MEAN_DIVISOR)
        if duration_mean_s
        else 0
    )
    return (
        conflict_count * W_CONFLICT_COUNT
        + active_streak * W_ACTIVE_STREAK
        + cooldown_breaches * W_COOLDOWN_BREACHES
        + duration_h
    )


def open_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.row_factory = sqlite3.Row
    return conn


def build_lifecycle(
    conn: sqlite3.Connection,
) -> dict[int, list[dict]]:
    """Reconstruye conflict_lifecycle desde event_log."""
    events = conn.execute(
        """SELECT event_id, type, entity_ref, ts,
                  aggregate_version, payload
           FROM event_log
           WHERE type IN ('pr.conflict', 'pr.conflict_resolved')
           ORDER BY ts ASC, id ASC"""
    ).fetchall()

    lifecycle: dict[int, list[dict]] = {}
    open_conflicts: dict[int, dict] = {}

    for ev in events:
        try:
            pr_number = int(ev["entity_ref"])
        except (ValueError, TypeError):
            continue

        if pr_number not in lifecycle:
            lifecycle[pr_number] = []

        if ev["type"] == "pr.conflict":
            title = ""
            try:
                payload = json.loads(ev["payload"])
                title = payload.get("title", "")
            except (json.JSONDecodeError, TypeError):
                pass
            entry = {
                "id": ev["event_id"],
                "pr_number": pr_number,
                "state": "entered",
                "event_id": ev["event_id"],
                "aggregate_version": ev["aggregate_version"],
                "detected_at": ev["ts"],
                "resolved_at": None,
                "duration_seconds": None,
                "title": title,
            }
            lifecycle[pr_number].append(entry)
            open_conflicts[pr_number] = entry

        elif ev["type"] == "pr.conflict_resolved":
            if pr_number in open_conflicts:
                entry = open_conflicts[pr_number]
                entry["state"] = "resolved"
                entry["resolved_at"] = ev["ts"]
                det_ms = _parse_ts(entry["detected_at"])
                res_ms = _parse_ts(ev["ts"])
                if det_ms and res_ms:
                    entry["duration_seconds"] = max(
                        0, round((res_ms - det_ms) / 1000)
                    )
                del open_conflicts[pr_number]

    return lifecycle


def build_trajectory(
    conn: sqlite3.Connection,
    lifecycle: dict[int, list[dict]],
) -> dict[int, dict]:
    """Calcula conflict_trajectory desde lifecycle."""
    trajectory: dict[int, dict] = {}

    for pr_number, entries in lifecycle.items():
        conflict_count = sum(
            1 for e in entries if e["state"] in ("entered", "resolved")
        )
        resolution_count = sum(
            1 for e in entries if e["state"] == "resolved"
        )

        # Active streak: últimas entradas consecutivas 'entered'
        active_streak = 0
        for e in reversed(entries):
            if e["state"] == "entered":
                active_streak += 1
            else:
                break

        # Cooldown breaches
        cooldown_breaches = 0
        last_resolved_ts = None
        last_conflict_ts = None
        for e in entries:
            if e["state"] == "entered":
                if last_resolved_ts and last_conflict_ts:
                    gap_s = (
                        _parse_ts(last_conflict_ts)
                        - _parse_ts(last_resolved_ts)
                    ) / 1000
                    if 0 <= gap_s < COOLDOWN_WINDOW_S:
                        cooldown_breaches += 1
                last_conflict_ts = e["detected_at"]
            elif e["state"] == "resolved":
                last_resolved_ts = e["resolved_at"]

        # Avg duration
        durations = [
            e["duration_seconds"]
            for e in entries
            if e["duration_seconds"] is not None
        ]
        avg_dur = (
            sum(durations) / len(durations) if durations else None
        )

        pressure = compute_pressure(
            conflict_count, active_streak,
            cooldown_breaches, avg_dur,
        )

        first_seen = entries[0]["detected_at"]
        last_seen = (
            entries[-1].get("resolved_at")
            or entries[-1]["detected_at"]
        )
        max_agg = max(e["aggregate_version"] for e in entries)

        trajectory[pr_number] = {
            "pr_number": pr_number,
            "conflict_count": conflict_count,
            "resolution_count": resolution_count,
            "active_streak": active_streak,
            "cooldown_breaches": cooldown_breaches,
            "pressure_score": pressure,
            "first_seen_at": first_seen,
            "last_seen_at": last_seen,
            "aggregate_version": max_agg,
        }

    return trajectory


def evaluate_rules(
    conn: sqlite3.Connection,
    lifecycle: dict[int, list[dict]],
    trajectory: dict[int, dict],
    evaluated_at: str,
) -> int:
    """Evalúa reglas de alerting y genera decision_log."""
    decisions = 0

    # ── conflict_duration (abiertos > 3600s) ──
    thr_dur = {"seconds": 3600}
    for pr_number, entries in lifecycle.items():
        for entry in entries:
            if entry["state"] != "entered":
                continue
            det_ms = _parse_ts(entry["detected_at"])
            now_ms = _parse_ts(evaluated_at)
            age_s = (
                max(0, round((now_ms - det_ms) / 1000))
                if det_ms and now_ms
                else 0
            )
            triggered = age_s > thr_dur["seconds"]
            conn.execute(
                """INSERT OR IGNORE INTO decision_log
                   (rule_id, evaluated_at, entity_kind, entity_ref,
                    state_snapshot, pressure_snapshot, threshold,
                    triggered, alert_id, dedupe_key, message)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    "conflict_duration",
                    evaluated_at,
                    "pr",
                    str(pr_number),
                    json.dumps({
                        "pr_number": pr_number,
                        "age_s": age_s,
                    }),
                    None,
                    json.dumps(thr_dur),
                    1 if triggered else 0,
                    None,
                    f"conflict_duration:{pr_number}"
                    if triggered else None,
                    f"PR #{pr_number} en conflicto hace "
                    f"{round(age_s / 60)}min"
                    if triggered else None,
                ),
            )
            decisions += 1

    # ── conflict_pressure (>= 8.0) ──
    thr_pres = {"pressure": 8.0}
    for pr_number, t in trajectory.items():
        if t["pressure_score"] >= thr_pres["pressure"]:
            conn.execute(
                """INSERT OR IGNORE INTO decision_log
                   (rule_id, evaluated_at, entity_kind, entity_ref,
                    state_snapshot, pressure_snapshot, threshold,
                    triggered, alert_id, dedupe_key, message)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    "conflict_pressure",
                    evaluated_at,
                    "pr",
                    str(pr_number),
                    json.dumps({
                        "pr_number": pr_number,
                        "pressure_score": t["pressure_score"],
                    }),
                    json.dumps({
                        "pressure": t["pressure_score"],
                        "conflict_count": t["conflict_count"],
                        "active_streak": t["active_streak"],
                        "cooldown_breaches": t["cooldown_breaches"],
                    }),
                    json.dumps(thr_pres),
                    1,
                    None,
                    f"conflict_pressure:{pr_number}",
                    f"PR #{pr_number} pressure "
                    f"{t['pressure_score']:.1f}",
                ),
            )
            decisions += 1

    # ── conflict_frequency (>= 3 conflictos) ──
    thr_freq = {"count": 3}
    for pr_number, entries in lifecycle.items():
        count = len(entries)
        if count >= thr_freq["count"]:
            conn.execute(
                """INSERT OR IGNORE INTO decision_log
                   (rule_id, evaluated_at, entity_kind, entity_ref,
                    state_snapshot, pressure_snapshot, threshold,
                    triggered, alert_id, dedupe_key, message)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    "conflict_frequency",
                    evaluated_at,
                    "pr",
                    str(pr_number),
                    json.dumps({
                        "pr_number": pr_number,
                        "count": count,
                    }),
                    None,
                    json.dumps(thr_freq),
                    1,
                    None,
                    f"conflict_freq:{pr_number}",
                    f"PR #{pr_number} con {count} "
                    f"conflictos históricos",
                ),
            )
            decisions += 1

    return decisions


def backfill(conn: sqlite3.Connection) -> int:
    """Backfill completo: DELETE + replay decision_log."""
    conn.execute("DELETE FROM decision_log")

    lifecycle = build_lifecycle(conn)
    if not lifecycle:
        print(
            "No conflict events found in event_log. "
            "Nothing to backfill."
        )
        return 0

    trajectory = build_trajectory(conn, lifecycle)
    evaluated_at = now_iso()
    decisions = evaluate_rules(
        conn, lifecycle, trajectory, evaluated_at,
    )

    return decisions


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill decision_log from event_log"
    )
    parser.add_argument(
        "--db",
        default=os.environ.get(
            "DATABASE_PATH",
            str(ROOT / "data" / "control-plane.db"),
        ),
        help="Path to SQLite database",
    )
    args = parser.parse_args()

    if not Path(args.db).exists():
        print(f"Database not found: {args.db}", file=sys.stderr)
        sys.exit(1)

    conn = open_db(args.db)
    try:
        with conn:
            n = backfill(conn)
        print(
            f"✅ Backfill complete: {n} decision records "
            f"written to decision_log."
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
