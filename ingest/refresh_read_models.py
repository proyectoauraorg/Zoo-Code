#!/usr/bin/env python3
"""Refresca los read models materializados de ZooDash.

Ejecuta los projectors de contributor_summary, conflict_hotspot y system_snapshot
leyendo de las tablas base de SQLite.

Uso:
    python3 ingest/refresh_read_models.py
    python3 ingest/refresh_read_models.py --db /tmp/x.db
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.split(" #", 1)[0].strip().strip('"').strip("'")
        env[key.strip()] = val
    return env


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def refresh_contributor_summary(conn: sqlite3.Connection) -> int:
    """Materializa contributor_summary desde pr_snapshot + pr_author."""
    now = now_iso()
    latest = conn.execute("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1").fetchone()
    if not latest:
        return 0

    rows = conn.execute(
        """SELECT pa.login,
                  SUM(CASE WHEN ps.state = 'OPEN' THEN 1 ELSE 0 END) AS prs_opened,
                  SUM(CASE WHEN ps.state = 'MERGED' THEN 1 ELSE 0 END) AS prs_merged,
                  SUM(CASE WHEN ps.state = 'CLOSED' THEN 1 ELSE 0 END) AS prs_closed,
                  MAX(ps.updated_at) AS last_active
           FROM pr_author pa
           JOIN pr_snapshot ps ON ps.ts = pa.ts AND ps.number = pa.pr_number
           WHERE pa.ts = ?
           GROUP BY pa.login""",
        (latest["ts"],),
    ).fetchall()

    total_prs = sum(r["prs_opened"] + r["prs_merged"] + r["prs_closed"] for r in rows)

    with conn:
        conn.execute("DELETE FROM contributor_summary")
        for r in rows:
            total = r["prs_opened"] + r["prs_merged"] + r["prs_closed"]
            share = round((total / total_prs) * 10000) / 100 if total_prs > 0 else 0
            conn.execute(
                """INSERT INTO contributor_summary
                   (login, prs_opened, prs_merged, prs_closed,
                    commit_share_pct, last_active, refreshed_at, schema_version)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
                (r["login"], r["prs_opened"], r["prs_merged"], r["prs_closed"],
                 share, r["last_active"], now),
            )
    return len(rows)


def refresh_conflict_hotspot(conn: sqlite3.Connection) -> int:
    """Materializa conflict_hotspot desde pr_snapshot (mergeable=CONFLICTING)."""
    now = now_iso()
    latest = conn.execute("SELECT ts FROM poll ORDER BY ts DESC LIMIT 1").fetchone()
    if not latest:
        return 0

    rows = conn.execute(
        "SELECT number, title FROM pr_snapshot WHERE ts = ? AND mergeable = 'CONFLICTING'",
        (latest["ts"],),
    ).fetchall()

    if not rows:
        return 0

    with conn:
        for r in rows:
            path = f"PR#{r['number']}"
            conn.execute(
                """INSERT INTO conflict_hotspot (path, times, last_seen, schema_version)
                   VALUES (?, 1, ?, 1)
                   ON CONFLICT(path) DO UPDATE SET times = times + 1, last_seen = ?""",
                (path, now, now),
            )
    return len(rows)


def refresh_system_snapshot(conn: sqlite3.Connection) -> int:
    """Materializa system_snapshot con métricas clave."""
    now = now_iso()

    # Calcular métricas
    snapshot_age = None
    gh_path = Path(conn.execute("PRAGMA database_list").fetchone()[2] if False else "")
    latest = conn.execute("SELECT MAX(ts) AS ts FROM poll").fetchone()
    if latest and latest["ts"]:
        try:
            snapshot_age = int(
                (datetime.now(timezone.utc) - datetime.fromisoformat(
                    latest["ts"].replace("Z", "+00:00")
                )).total_seconds()
            )
        except (ValueError, TypeError):
            pass

    entries = [
        ("poll_count", conn.execute("SELECT COUNT(*) AS n FROM poll").fetchone()["n"]),
        ("pr_count", conn.execute("SELECT COUNT(*) AS n FROM pr_snapshot WHERE ts = (SELECT MAX(ts) FROM poll)").fetchone()["n"]),
        ("contributor_count", conn.execute("SELECT COUNT(*) AS n FROM contributor").fetchone()["n"]),
        ("conflict_count", conn.execute("SELECT COUNT(*) AS n FROM pr_snapshot WHERE ts = (SELECT MAX(ts) FROM poll) AND mergeable = 'CONFLICTING'").fetchone()["n"]),
        ("snapshot_age_s", snapshot_age),
    ]

    with conn:
        conn.execute("DELETE FROM system_snapshot")
        for key, val in entries:
            conn.execute(
                """INSERT INTO system_snapshot (key, value, refreshed_at, schema_version)
                   VALUES (?, ?, ?, 1)""",
                (key, json.dumps(val), now),
            )
    return len(entries)


def main(argv: list[str] | None = None) -> int:
    env = load_env(ROOT / ".env.local")
    ap = argparse.ArgumentParser(description="Refresh ZooDash read models")
    ap.add_argument("--db", default=None)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    db_arg = args.db or env.get("DATABASE_PATH", "./data/control-plane.db")
    db_path = Path(db_arg)
    if not db_path.is_absolute():
        db_path = ROOT / db_path

    conn = connect(db_path)
    try:
        n_cs = refresh_contributor_summary(conn)
        n_ch = refresh_conflict_hotspot(conn)
        n_ss = refresh_system_snapshot(conn)
    finally:
        conn.close()

    if not args.quiet:
        print(f"✅ Read models refrescados:")
        print(f"   contributor_summary: {n_cs} entradas")
        print(f"   conflict_hotspot: {n_ch} entradas")
        print(f"   system_snapshot: {n_ss} entradas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
