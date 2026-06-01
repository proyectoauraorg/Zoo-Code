#!/usr/bin/env python3
"""ZooDash historian — historiza los snapshots del Context-Sync Runtime en SQLite.

Filosofía (SPEC §1): el runtime YA recolecta; aquí solo LEEMOS sus artefactos
(`.context_sync/snapshots/github.json` + `state.json`) y hacemos APPEND idempotente
por poll, calculando además las transiciones (`pr_event`) entre dos polls consecutivos.

- Solo lectura sobre los snapshots (nunca los mutamos).
- Idempotente por `poll.ts` (= `github.json.fetched_at`): correrlo dos veces con el
  mismo barrido no duplica filas (el INSERT va dentro de una transacción y se omite
  si el poll ya existe).
- Sin dependencias externas (stdlib: json, sqlite3). Atomicidad vía transacción SQLite,
  en el espíritu de scripts/context_sync/store.py.

Uso:
    python3 ingest/historian.py                 # lee rutas de .env.local
    python3 ingest/historian.py --notify        # además dispara Apprise (notify.py)
    python3 ingest/historian.py --db /tmp/x.db --github /tmp/gh.json   # overrides (tests)
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent  # .../ZooDash
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- Config (.env.local, parser mínimo sin deps) --------------------------------------
def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        # quita comentarios inline y comillas
        val = val.split(" #", 1)[0].strip().strip('"').strip("'")
        env[key.strip()] = val
    return env


# --- Lógica de columna Kanban (espejo de la del frontend) ------------------------------
def kanban_column(state: str, review_decision: str, is_draft: bool) -> str:
    if state == "MERGED":
        return "Merged"
    if state == "CLOSED":
        return "Closed"
    if is_draft:
        return "Draft"
    if review_decision == "CHANGES_REQUESTED":
        return "Changes Requested"
    if review_decision == "APPROVED":
        return "Approved"
    return "Review"  # REVIEW_REQUIRED o ''


# --- Parseo del snapshot ----------------------------------------------------------------
def _as_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def parse_github_snapshot(gh: dict[str, Any]) -> dict[str, Any]:
    """Extrae poll-ts, métricas agregadas, PRs, issues y autores del snapshot (degrada con defaults)."""
    items = gh.get("items") or []
    raw = gh.get("raw") or {}

    drift = next((i for i in items if i.get("kind") == "drift"), None)
    drift_meta = (drift or {}).get("meta") or {}
    release = next((i for i in items if i.get("kind") == "release"), None)

    metric = {
        "pr_open": _as_int(raw.get("pr_open")),
        "pr_merged": _as_int(raw.get("pr_merged")),
        "pr_closed": _as_int(raw.get("pr_closed")),
        "pr_ci_failing": _as_int(raw.get("pr_ci_failing")),
        "issues": _as_int(raw.get("issues")),
        "mentions": _as_int(raw.get("mentions")),
        "subscriptions": _as_int(raw.get("subscriptions")),
        "notifs_total": _as_int(raw.get("notifs_total")),
        "drift_ahead": _as_int(drift_meta.get("ahead")),
        "drift_behind": _as_int(drift_meta.get("behind")),
        "release": (release or {}).get("id") or None,
    }

    prs: list[dict[str, Any]] = []
    for it in items:
        if it.get("kind") != "pr":
            continue
        number = _as_int(it.get("id"), -1)
        if number < 0:
            continue
        meta = it.get("meta") or {}
        ci = meta.get("ci") or {}
        actor = (it.get("actor") or "").strip() or None
        prs.append({
            "number": number,
            "title": it.get("title") or "",
            "url": it.get("url") or "",
            "state": it.get("state") or "",
            "actor": actor,
            "review_decision": meta.get("reviewDecision") or "",
            "mergeable": meta.get("mergeable") or "UNKNOWN",
            "is_draft": 1 if meta.get("isDraft") else 0,
            "ci_state": (ci.get("state") or "none"),
            "ci_passed": _as_int(ci.get("passed")),
            "ci_failed": _as_int(ci.get("failed")),
            "ci_pending": _as_int(ci.get("pending")),
            "updated_at": it.get("ts") or "",
            "created_at": (meta.get("createdAt") or it.get("created_at") or "").strip() or None,
            "merged_at": (meta.get("mergedAt") or it.get("merged_at") or "").strip() or None,
        })

    issues: list[dict[str, Any]] = []
    for it in items:
        if it.get("kind") != "issue":
            continue
        number = _as_int(it.get("id"), -1)
        if number < 0:
            continue
        meta = it.get("meta") or {}
        labels = meta.get("labels")
        issues.append({
            "number": number,
            "title": it.get("title") or "",
            "url": it.get("url") or "",
            "state": it.get("state") or "",
            "labels": json.dumps(labels, ensure_ascii=False) if labels else "[]",
            "assignee": meta.get("assignee") or None,
            "milestone": meta.get("milestone") or None,
            "updated_at": it.get("ts") or "",
        })

    return {"metric": metric, "prs": prs, "issues": issues}


# --- Cálculo de eventos (diff contra el poll anterior) ---------------------------------
def compute_events(prev_prs: dict[int, sqlite3.Row], curr_prs: list[dict[str, Any]]
                   ) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    def add(number: int, kind: str, frm: str | None, to: str | None, detail: str) -> None:
        events.append({"number": number, "kind": kind, "from": frm, "to": to, "detail": detail})

    for pr in curr_prs:
        n = pr["number"]
        prev = prev_prs.get(n)
        cur_col = kanban_column(pr["state"], pr["review_decision"], bool(pr["is_draft"]))

        if prev is None:
            add(n, "new", None, pr["state"], pr["title"])
            if pr["ci_state"] == "fail":
                add(n, "ci_red", None, "fail", pr["title"])
            if pr["mergeable"] == "CONFLICTING":
                add(n, "conflict", None, "CONFLICTING", pr["title"])
            continue

        prev_col = kanban_column(prev["state"], prev["review_decision"], bool(prev["is_draft"]))

        if prev["state"] != "MERGED" and pr["state"] == "MERGED":
            add(n, "merged", prev["state"], "MERGED", pr["title"])
        elif prev["state"] != "CLOSED" and pr["state"] == "CLOSED":
            add(n, "closed", prev["state"], "CLOSED", pr["title"])
        elif prev_col != cur_col:
            add(n, "state_change", prev_col, cur_col, pr["title"])

        if prev["ci_state"] != "fail" and pr["ci_state"] == "fail":
            add(n, "ci_red", prev["ci_state"], "fail", pr["title"])
        elif prev["ci_state"] == "fail" and pr["ci_state"] == "pass":
            add(n, "ci_green", "fail", "pass", pr["title"])

        if prev["mergeable"] != "CONFLICTING" and pr["mergeable"] == "CONFLICTING":
            add(n, "conflict", prev["mergeable"], "CONFLICTING", pr["title"])
        elif prev["mergeable"] == "CONFLICTING" and pr["mergeable"] != "CONFLICTING":
            add(n, "resolved", "CONFLICTING", pr["mergeable"], pr["title"])

    return events


# --- Persistencia (idempotente, transaccional) -----------------------------------------
def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def ingest(conn: sqlite3.Connection, gh: dict[str, Any]) -> dict[str, Any]:
    ts = gh.get("fetched_at")
    if not ts:
        raise ValueError("github.json sin 'fetched_at': no se puede historizar")

    # Idempotencia: si el poll ya existe, no hacemos nada.
    if conn.execute("SELECT 1 FROM poll WHERE ts = ?", (ts,)).fetchone():
        return {"ts": ts, "skipped": True, "events": []}

    parsed = parse_github_snapshot(gh)
    metric, prs, issues = parsed["metric"], parsed["prs"], parsed["issues"]

    # Poll anterior (ISO-8601 UTC ordena lexicográficamente = cronológicamente).
    prev_row = conn.execute(
        "SELECT ts FROM poll WHERE ts < ? ORDER BY ts DESC LIMIT 1", (ts,)
    ).fetchone()
    prev_prs: dict[int, sqlite3.Row] = {}
    if prev_row:
        for r in conn.execute("SELECT * FROM pr_snapshot WHERE ts = ?", (prev_row["ts"],)):
            prev_prs[r["number"]] = r

    events = compute_events(prev_prs, prs) if prev_row else []

    with conn:  # transacción: todo o nada
        conn.execute(
            "INSERT INTO poll(ts, ingested_at, source_ok, note) VALUES (?,?,?,?)",
            (ts, now_iso(), 1 if gh.get("ok", True) else 0, gh.get("summary")),
        )
        conn.execute(
            """INSERT INTO repo_metric
               (ts, pr_open, pr_merged, pr_closed, pr_ci_failing, issues, mentions,
                subscriptions, notifs_total, drift_ahead, drift_behind, release)
               VALUES (:ts,:pr_open,:pr_merged,:pr_closed,:pr_ci_failing,:issues,
                       :mentions,:subscriptions,:notifs_total,:drift_ahead,:drift_behind,:release)""",
            {"ts": ts, **metric},
        )
        conn.executemany(
            """INSERT INTO pr_snapshot
               (ts, number, title, url, state, review_decision, mergeable, is_draft,
                ci_state, ci_passed, ci_failed, ci_pending, updated_at,
                created_at, merged_at)
               VALUES (:ts,:number,:title,:url,:state,:review_decision,:mergeable,:is_draft,
                       :ci_state,:ci_passed,:ci_failed,:ci_pending,:updated_at,
                       :created_at,:merged_at)""",
            [{"ts": ts, **pr} for pr in prs],
        )
        conn.executemany(
            """INSERT INTO issue_snapshot
               (ts, number, title, url, state, labels, assignee, milestone, updated_at)
               VALUES (:ts,:number,:title,:url,:state,:labels,:assignee,:milestone,:updated_at)""",
            [{"ts": ts, **iss} for iss in issues],
        )
        conn.executemany(
            "INSERT INTO pr_event(ts, number, kind, from_state, to_state, detail) "
            "VALUES (?,?,?,?,?,?)",
            [(ts, e["number"], e["kind"], e["from"], e["to"], e["detail"]) for e in events],
        )

        # --- Contributor tracking (actor del snapshot o backfill previo) ---
        for pr in prs:
            login = pr.get("actor")
            if not login:
                continue
            # Upsert contributor
            existing = conn.execute(
                "SELECT login, first_seen, prs_opened, prs_merged, prs_closed FROM contributor WHERE login = ?",
                (login,),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE contributor SET last_seen = ?, prs_opened = prs_opened + ?, "
                    "prs_merged = prs_merged + ?, prs_closed = prs_closed + ? WHERE login = ?",
                    (ts, 1 if pr["state"] == "OPEN" else 0,
                     1 if pr["state"] == "MERGED" else 0,
                     1 if pr["state"] == "CLOSED" else 0, login),
                )
            else:
                conn.execute(
                    "INSERT INTO contributor(login, first_seen, last_seen, prs_opened, prs_merged, prs_closed) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (login, ts, ts,
                     1 if pr["state"] == "OPEN" else 0,
                     1 if pr["state"] == "MERGED" else 0,
                     1 if pr["state"] == "CLOSED" else 0),
                )
            # Insert pr_author bridge
            conn.execute(
                "INSERT OR IGNORE INTO pr_author(ts, pr_number, login) VALUES (?,?,?)",
                (ts, pr["number"], login),
            )

    return {
        "ts": ts, "skipped": False, "events": events,
        "n_prs": len(prs), "n_issues": len(issues), "metric": metric,
        "prs": prs, "had_prev": bool(prev_row),
        "authors": [pr["actor"] for pr in prs if pr.get("actor")],
    }


# --- Notificaciones (Apprise vía notify.py del runtime) --------------------------------
def build_alerts(result: dict[str, Any], env: dict[str, str]) -> list[str]:
    """Textos de alta señal para Apprise: CI→roja, conflicto nuevo, PRs stale."""
    if result.get("skipped"):
        return []
    texts: list[str] = []
    for e in result.get("events", []):
        if e["kind"] == "ci_red":
            texts.append(f"🔴 PR #{e['number']} CI en rojo: {e['detail']}")
        elif e["kind"] == "conflict":
            texts.append(f"⚠️ PR #{e['number']} con conflictos: {e['detail']}")

    stale_days = _as_int(env.get("STALE_PR_DAYS"), 5)
    cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=stale_days)
    for pr in result.get("prs", []):
        if pr["state"] != "OPEN":
            continue
        if pr["review_decision"] not in ("", "REVIEW_REQUIRED", "CHANGES_REQUESTED"):
            continue
        try:
            upd = _dt.datetime.strptime(pr["updated_at"], "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=_dt.timezone.utc)
        except (TypeError, ValueError):
            continue
        if upd < cutoff:
            texts.append(f"🕒 PR #{pr['number']} stale ({stale_days}d sin update, review pendiente): {pr['title']}")
    return texts


def dispatch_notifications(texts: list[str], env: dict[str, str]) -> int:
    if not texts:
        return 0
    python_bin = env.get("PYTHON_BIN") or "python3"
    ctx_dir = env.get("CONTEXT_SYNC_DIR", "")
    zsys_root = Path(ctx_dir).parent if ctx_dir else None
    if not zsys_root or not zsys_root.exists():
        print("[notify] no se pudo derivar la raíz de zSys; omito", file=sys.stderr)
        return 0
    try:
        subprocess.run(
            [python_bin, "-m", "scripts.context_sync.surfacing.notify", *texts],
            cwd=str(zsys_root), capture_output=True, timeout=30, check=False,
        )
        return len(texts)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"[notify] fallo al invocar notify.py: {exc}", file=sys.stderr)
        return 0


# --- Discord historization ----------------------------------------------------------------
def ingest_discord(conn: sqlite3.Connection, dc_path: Path) -> dict[str, Any]:
    """Lee discord.json e historiza en discord_activity (idempotente)."""
    if not dc_path.exists():
        return {"ok": False, "reason": "file not found", "items": 0}

    try:
        dc = json.loads(dc_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"ok": False, "reason": str(exc), "items": 0}

    items = dc.get("items") or []
    if not items:
        return {"ok": True, "reason": "empty", "items": 0}

    count = 0
    with conn:
        for it in items:
            ts = it.get("ts") or ""
            user = it.get("user") or ""
            channel = it.get("channel") or ""
            msg_type = it.get("msg_type") or "message"
            detail = it.get("detail") or ""
            if not ts:
                continue
            conn.execute(
                "INSERT OR IGNORE INTO discord_activity"
                "(ts, user, channel, msg_type, detail) "
                "VALUES (?,?,?,?,?)",
                (ts, user, channel, msg_type, detail),
            )
            count += 1

    return {"ok": True, "items": count}


# --- CLI --------------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    env = load_env(ROOT / ".env.local")
    ap = argparse.ArgumentParser(description="ZooDash historian")
    ap.add_argument("--db", default=None, help="ruta a la SQLite (default: DATABASE_PATH de .env.local)")
    ap.add_argument("--github", default=None, help="ruta a github.json (default: GITHUB_SNAPSHOT)")
    ap.add_argument("--notify", action="store_true", help="dispara Apprise ante CI roja/conflicto/stale")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    db_arg = args.db or env.get("DATABASE_PATH", "./data/control-plane.db")
    db_path = Path(db_arg)
    if not db_path.is_absolute():
        db_path = ROOT / db_path
    gh_path = Path(args.github or env.get(
        "GITHUB_SNAPSHOT",
        "/Users/dr.armandovaquera/zSys/.context_sync/snapshots/github.json"))
    dc_path = Path(env.get(
        "DISCORD_SNAPSHOT",
        "/Users/dr.armandovaquera/zSys/.context_sync/snapshots/discord.json"))

    try:
        gh = json.loads(gh_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR leyendo snapshot {gh_path}: {exc}", file=sys.stderr)
        return 1

    conn = connect(db_path)
    try:
        result = ingest(conn, gh)
        dc_result = ingest_discord(conn, dc_path)
    finally:
        conn.close()

    sent = 0
    if args.notify:
        sent = dispatch_notifications(build_alerts(result, env), env)

    if not args.quiet:
        if result["skipped"]:
            print(f"⏭  poll {result['ts']} ya historizado (idempotente, sin cambios).")
        else:
            ev = result["events"]
            kinds: dict[str, int] = {}
            for e in ev:
                kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
            kinds_str = ", ".join(f"{k}:{v}" for k, v in sorted(kinds.items())) or "—"
            print(f"✅ poll {result['ts']} historizado → "
                  f"{result['n_prs']} PRs, {result['n_issues']} issues; "
                  f"eventos: {kinds_str}" + ("" if result["had_prev"] else " (baseline, sin diff)"))
            print(f"   métricas: {result['metric']}")
            if args.notify:
                print(f"   notificaciones enviadas: {sent}")
        if dc_result["ok"]:
            print(f"💬 Discord: {dc_result['items']} mensajes historizados")
        else:
            print(f"💬 Discord: {dc_result['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
