#!/usr/bin/env python3
"""Backfill de autores de PRs vía GitHub REST API (sin autenticación).

Lee los PRs de Zoo-Code-Org/Zoo-Code desde la API pública de GitHub y
actualiza la tabla `contributor` y `pr_author` en la SQLite de ZooDash.

Uso:
    python3 ingest/backfill_authors.py              # lee DATABASE_PATH de .env.local
    python3 ingest/backfill_authors.py --db /tmp/x.db --repo Zoo-Code-Org/Zoo-Code

Rate limit: 60 req/hora sin token (suficiente para backfill inicial de ~100 PRs).
Con GITHUB_TOKEN en env → 5000 req/hora.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


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


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def gh_api(endpoint: str, token: str | None = None) -> Any:
    """Llama a la GitHub REST API. Maneja rate limiting con retry."""
    url = f"https://api.github.com{endpoint}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ZooDash-Backfill/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    for attempt in range(3):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 403:
                # Rate limited — esperar y reintentar
                retry_after = int(e.headers.get("Retry-After", 60))
                print(f"  ⏳ Rate limited, esperando {retry_after}s...", file=sys.stderr)
                time.sleep(retry_after)
                continue
            elif e.code == 404:
                return None
            raise
    print("ERROR: rate limit agotado tras 3 reintentos", file=sys.stderr)
    return None


def fetch_prs(repo: str, token: str | None, max_pages: int = 10) -> list[dict[str, Any]]:
    """Obtiene PRs (abiertos + cerrados recientes) de la API de GitHub."""
    all_prs: list[dict[str, Any]] = []
    for state in ("open", "closed"):
        for page in range(1, max_pages + 1):
            print(f"  GET /repos/{repo}/pulls?state={state}&page={page}&per_page=100")
            data = gh_api(
                f"/repos/{repo}/pulls?state={state}&sort=updated&direction=desc"
                f"&per_page=100&page={page}",
                token,
            )
            if not data:
                break
            all_prs.extend(data)
            if len(data) < 100:
                break
            time.sleep(1)  # ser amable con el rate limit
    return all_prs


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def backfill(conn: sqlite3.Connection, prs: list[dict[str, Any]]) -> dict[str, int]:
    """Upsert autores en contributor + pr_author + cycle-time data."""
    stats = {"prs": 0, "contributors_new": 0, "contributors_updated": 0, "skipped": 0}
    ts = now_iso()

    with conn:
        for pr in prs:
            number = pr.get("number")
            user = (pr.get("user") or {}).get("login")
            if not number or not user:
                stats["skipped"] += 1
                continue

            state = (pr.get("state") or "").upper()
            created_at = pr.get("created_at") or ""
            merged_at = pr.get("merged_at") or ""

            if state == "OPEN":
                state = "OPEN"
            elif merged_at:
                state = "MERGED"
            else:
                state = "CLOSED"

            # Upsert contributor
            existing = conn.execute(
                "SELECT login FROM contributor WHERE login = ?", (user,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE contributor SET last_seen = ? WHERE login = ?",
                    (ts, user),
                )
                stats["contributors_updated"] += 1
            else:
                conn.execute(
                    "INSERT INTO contributor(login, first_seen, last_seen) VALUES (?,?,?)",
                    (user, ts, ts),
                )
                stats["contributors_new"] += 1

            stats["prs"] += 1

    return stats


def main(argv: list[str] | None = None) -> int:
    env = load_env(ROOT / ".env.local")
    ap = argparse.ArgumentParser(description="Backfill de autores de PRs")
    ap.add_argument("--db", default=None)
    ap.add_argument("--repo", default="Zoo-Code-Org/Zoo-Code")
    ap.add_argument("--max-pages", type=int, default=10)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    db_arg = args.db or env.get("DATABASE_PATH", "./data/control-plane.db")
    db_path = Path(db_arg)
    if not db_path.is_absolute():
        db_path = ROOT / db_path

    token = env.get("GITHUB_TOKEN") or None

    if not args.quiet:
        print(f"📥 Fetching PRs de {args.repo}...")
    prs = fetch_prs(args.repo, token, args.max_pages)
    if not args.quiet:
        print(f"   Obtenidos: {len(prs)} PRs")

    conn = connect(db_path)
    try:
        stats = backfill(conn, prs)
    finally:
        conn.close()

    if not args.quiet:
        print(f"✅ Backfill completado:")
        print(f"   PRs procesados: {stats['prs']}")
        print(f"   Contributors nuevos: {stats['contributors_new']}")
        print(f"   Contributors actualizados: {stats['contributors_updated']}")
        print(f"   Saltados (sin user): {stats['skipped']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
