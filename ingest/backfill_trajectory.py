#!/usr/bin/env python3
"""
Backfill script for conflict_trajectory (v1.2.1).

Lee todos los eventos de conflicto del event_log y recalcula
la tabla conflict_trajectory. Idempotente: DELETE + replay.

Uso:
  python3 ingest/backfill_trajectory.py [--db path/to/zoodash.db]
"""

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

# Pesos del modelo de presión (alineados con conflict-trajectory.ts)
W_CONFLICT_COUNT = 1.0
W_ACTIVE_STREAK = 1.8
W_COOLDOWN_BREACHES = 2.5
W_DURATION_MEAN_DIVISOR = 3600

COOLDOWN_WINDOW_S = 24 * 3600  # 24 horas


def compute_pressure(conflict_count, active_streak, cooldown_breaches, duration_mean_s):
    duration_h = (duration_mean_s / W_DURATION_MEAN_DIVISOR) if duration_mean_s else 0
    return (
        conflict_count * W_CONFLICT_COUNT
        + active_streak * W_ACTIVE_STREAK
        + cooldown_breaches * W_COOLDOWN_BREACHES
        + duration_h
    )


def get_avg_duration(conn, pr_number):
    """Duración media de conflictos resueltos de un PR."""
    row = conn.execute(
        """SELECT AVG(duration_seconds) AS avg_s
           FROM conflict_lifecycle
           WHERE pr_number = ? AND state = 'resolved'
             AND duration_seconds IS NOT NULL""",
        (pr_number,),
    ).fetchone()
    return row[0] if row and row[0] is not None else None


def backfill(conn):
    # 1. Limpiar tabla
    conn.execute("DELETE FROM conflict_trajectory")

    # 2. Leer eventos de conflicto ordenados
    events = conn.execute(
        """SELECT event_id, type, entity_ref, ts, aggregate_version, payload
           FROM event_log
           WHERE type IN ('pr.conflict', 'pr.conflict_resolved')
           ORDER BY ts ASC, id ASC"""
    ).fetchall()

    if not events:
        print("No conflict events found in event_log. Nothing to backfill.")
        return 0

    # 3. Estado en memoria por PR
    state = {}  # pr_number -> dict

    for event_id, etype, entity_ref, ts, agg_ver, payload_raw in events:
        try:
            pr_number = int(entity_ref)
        except (ValueError, TypeError):
            continue

        if pr_number not in state:
            state[pr_number] = {
                "conflict_count": 0,
                "resolution_count": 0,
                "active_streak": 0,
                "cooldown_breaches": 0,
                "first_seen_at": ts,
                "last_seen_at": ts,
                "aggregate_version": agg_ver,
                "_last_conflict_ts": None,
                "_last_resolved_ts": None,
            }

        s = state[pr_number]
        s["last_seen_at"] = ts
        s["aggregate_version"] = max(s["aggregate_version"], agg_ver)

        if etype == "pr.conflict":
            # Detectar cooldown breach
            if s["_last_resolved_ts"] and s["_last_conflict_ts"]:
                gap_s = (
                    _parse_ts(s["_last_conflict_ts"]) - _parse_ts(s["_last_resolved_ts"])
                ) / 1000
                if 0 <= gap_s < COOLDOWN_WINDOW_S:
                    s["cooldown_breaches"] += 1

            s["conflict_count"] += 1
            s["active_streak"] += 1
            s["_last_conflict_ts"] = ts

        elif etype == "pr.conflict_resolved":
            s["resolution_count"] += 1
            s["active_streak"] = 0  # reset streak
            s["_last_resolved_ts"] = ts

    # 4. Insertar filas
    inserted = 0
    for pr_number, s in state.items():
        avg_dur = get_avg_duration(conn, pr_number)
        pressure = compute_pressure(
            s["conflict_count"],
            s["active_streak"],
            s["cooldown_breaches"],
            avg_dur,
        )
        conn.execute(
            """INSERT INTO conflict_trajectory
               (pr_number, conflict_count, resolution_count, active_streak,
                cooldown_breaches, pressure_score, first_seen_at, last_seen_at,
                aggregate_version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                pr_number,
                s["conflict_count"],
                s["resolution_count"],
                s["active_streak"],
                s["cooldown_breaches"],
                pressure,
                s["first_seen_at"],
                s["last_seen_at"],
                s["aggregate_version"],
            ),
        )
        inserted += 1

    conn.commit()
    return inserted


def _parse_ts(ts_str):
    """Parse ISO timestamp a epoch ms (tolerante)."""
    from datetime import datetime

    try:
        # ISO-8601 con o sin Z
        cleaned = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def main():
    parser = argparse.ArgumentParser(description="Backfill conflict_trajectory (v1.2.1)")
    parser.add_argument(
        "--db",
        default=os.environ.get("ZOODASH_DB", ""),
        help="Path to SQLite database (default: auto-detect)",
    )
    args = parser.parse_args()

    db_path = args.db
    if not db_path:
        # Auto-detect: buscar zoodash.db en ubicaciones comunes
        candidates = [
            Path("data/zoodash.db"),
            Path("zoodash.db"),
            Path("../data/zoodash.db"),
        ]
        for c in candidates:
            if c.exists():
                db_path = str(c)
                break
        if not db_path:
            print("ERROR: Could not find database. Use --db flag.", file=sys.stderr)
            sys.exit(1)

    if not Path(db_path).exists():
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    try:
        count = backfill(conn)
        print(f"✅ Backfill complete: {count} PR trajectories built from {db_path}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
