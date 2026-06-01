#!/usr/bin/env python3
"""
Conflict Enricher (V2.i) — detecta archivos en conflicto via git merge-tree.

Lee PRs con mergeable=CONFLICTING de la DB, ejecuta git merge-tree sobre un
clon read-only dedicado y persiste los archivos en conflicto en conflict_file.

Idempotente: INSERT OR IGNORE. No modifica el fork de trabajo.

Uso:
    python3 ingest/conflict_enricher.py [--db path/to/zoodash.db] [--mirror path/to/mirror.git]
    python3 ingest/conflict_enricher.py --repo-url https://github.com/org/repo.git
"""
from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# Patrones del parser de git merge-tree
MERGE_TREE_CONFLICT_RE = re.compile(
    r"CONFLICT\s*\(.*?\):\s*Merge conflict in\s+(.+)",
    re.MULTILINE,
)
MERGE_TREE_CHANGED_BOTH_RE = re.compile(
    r"changed in both\s*\n\s+base\s+\d+\s+\S+\s+(.+)",
    re.MULTILINE,
)


class ConflictFile(TypedDict):
    pr_number: int
    file_path: str
    conflict_id: str
    detected_at: str


class EnricherResult(TypedDict):
    prs_enriched: int
    files_detected: int
    errors: list[str]
    mirror_updated: bool


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def parse_merge_tree(output: str) -> list[str]:
    """Extrae paths de archivos en conflicto de la salida de git merge-tree."""
    paths: set[str] = set()
    for m in MERGE_TREE_CONFLICT_RE.finditer(output):
        paths.add(m.group(1).strip())
    for m in MERGE_TREE_CHANGED_BOTH_RE.finditer(output):
        paths.add(m.group(1).strip())
    return sorted(paths)


def ensure_mirror(mirror: Path, repo_url: str) -> None:
    """Clona el mirror si no existe. Idempotente (bare clone).
    Configura refspec para traer refs/pull/* (F-1 fix)."""
    if mirror.exists():
        # Asegurar que el refspec de PRs está configurado
        try:
            subprocess.check_call(
                [
                    "git", "-C", str(mirror),
                    "config", "--get-all", "remote.origin.fetch",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            pass
        # Verificar y añadir refspec de PRs si falta
        try:
            existing = subprocess.check_output(
                [
                    "git", "-C", str(mirror),
                    "config", "--get-all", "remote.origin.fetch",
                ],
                text=True,
                stderr=subprocess.DEVNULL,
            )
            if "refs/pull/" not in existing:
                subprocess.check_call(
                    [
                        "git", "-C", str(mirror),
                        "config", "--add", "remote.origin.fetch",
                        "+refs/pull/*/head:refs/pull/*/head",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except subprocess.CalledProcessError:
            pass
        return
    mirror.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(
        ["git", "clone", "--mirror", repo_url, str(mirror)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    # Añadir refspec de PRs después del clone (F-1 fix)
    try:
        subprocess.check_call(
            [
                "git", "-C", str(mirror),
                "config", "--add", "remote.origin.fetch",
                "+refs/pull/*/head:refs/pull/*/head",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        pass


def update_mirror(mirror: Path) -> None:
    """git fetch origin sobre el mirror (incluye PR refs). Read-only."""
    subprocess.check_call(
        ["git", "-C", str(mirror), "fetch", "origin"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def git_available() -> bool:
    """Verifica si git está en PATH."""
    return shutil.which("git") is not None


def open_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.row_factory = sqlite3.Row
    return conn


def get_conflicting_prs(
    conn: sqlite3.Connection,
) -> list[dict[str, int | str]]:
    """PRs con mergeable=CONFLICTING del ultimo poll."""
    rows = conn.execute(
        """SELECT DISTINCT ps.number, ps.title
           FROM pr_snapshot ps
           INNER JOIN (
             SELECT number, MAX(ts) AS max_ts
             FROM pr_snapshot GROUP BY number
           ) latest ON ps.number = latest.number
             AND ps.ts = latest.max_ts
           WHERE ps.mergeable = 'CONFLICTING'"""
    ).fetchall()
    return [dict(r) for r in rows]


def find_active_conflict_id(
    conn: sqlite3.Connection,
    pr_number: int,
) -> str:
    """Encuentra el conflict_id activo para un PR."""
    row = conn.execute(
        """SELECT id FROM conflict_lifecycle
           WHERE pr_number = ? AND state = 'entered'
           ORDER BY aggregate_version DESC LIMIT 1""",
        (pr_number,),
    ).fetchone()
    return row["id"] if row else f"auto:{pr_number}"


def get_merge_refs(
    mirror: Path,
    pr_number: int,
    repo_url: str | None = None,
) -> tuple[str, str, str] | None:
    """Obtiene (merge_base, main_ref, head_sha) para un PR del mirror."""
    # Intentar refs del mirror (GitHub mirror tiene refs/pull/N/head)
    try:
        head = subprocess.check_output(
            [
                "git", "-C", str(mirror),
                "rev-parse", f"refs/pull/{pr_number}/head",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return None

    # merge_base = ancestro común; main_ref = tip de la rama base que se mergea
    # contra head para detectar el conflicto REAL al integrar el PR (F-2 fix).
    for branch in ("main", "master"):
        main_ref = f"origin/{branch}"
        try:
            base = subprocess.check_output(
                [
                    "git", "-C", str(mirror),
                    "merge-base", main_ref, head,
                ],
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
            return (base, main_ref, head)
        except subprocess.CalledProcessError:
            continue

    return None


def get_git_version() -> tuple[int, int]:
    """Detecta versión mayor.minor de git."""
    try:
        out = subprocess.check_output(
            ["git", "--version"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        # "git version 2.39.0" → (2, 39)
        parts = out.strip().split()
        ver = parts[-1].split(".")
        return (int(ver[0]), int(ver[1]))
    except (subprocess.CalledProcessError, ValueError, IndexError):
        return (2, 0)


def run_merge_tree(
    mirror: Path,
    merge_base: str,
    main_ref: str,
    head: str,
) -> str | None:
    """Ejecuta git merge-tree con compatibilidad de versión (F-2 fix).

    Mergea el tip de la rama base (main_ref) contra head para detectar el
    conflicto real al integrar el PR. NO se mergea el merge_base contra head:
    head desciende del merge_base, así que ese merge es trivial y nunca
    reporta conflicto (ese era el nit residual de F-2).

    git >=2.38: forma nueva de 2 args (calcula el merge-base por sí sola).
    git <2.38:  forma vieja de 3 args (<merge-base> <ours> <theirs>)."""
    git_ver = get_git_version()
    try:
        if git_ver >= (2, 38):
            # Forma nueva: merge-tree <main_ref> <head>
            return subprocess.check_output(
                [
                    "git", "-C", str(mirror),
                    "merge-tree", main_ref, head,
                ],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        else:
            # Forma vieja: merge-tree <merge-base> <ours> <theirs>
            return subprocess.check_output(
                [
                    "git", "-C", str(mirror),
                    "merge-tree", merge_base, main_ref, head,
                ],
                text=True,
                stderr=subprocess.DEVNULL,
            )
    except subprocess.CalledProcessError:
        return None


def enrich_conflicts(
    db_path: str,
    mirror: Path,
    repo_url: str,
) -> EnricherResult:
    """Entry point: fetch + merge-tree para cada PR conflicting.
    F-4 fix: DELETE+INSERT por ciclo (reconcilia resolved_at)."""
    result: EnricherResult = {
        "prs_enriched": 0,
        "files_detected": 0,
        "errors": [],
        "mirror_updated": False,
    }

    # 1. Verificar git disponible
    if not git_available():
        result["errors"].append("git not found in PATH")
        return result

    # 2. Asegurar mirror
    try:
        ensure_mirror(mirror, repo_url)
    except subprocess.CalledProcessError as e:
        result["errors"].append(f"mirror clone failed: {e}")
        return result

    # 3. Fetch (una vez por batch)
    try:
        update_mirror(mirror)
        result["mirror_updated"] = True
    except subprocess.CalledProcessError as e:
        result["errors"].append(f"fetch failed: {e}")
        return result

    # 4. Obtener PRs conflicting
    conn = open_db(db_path)
    try:
        conflicting = get_conflicting_prs(conn)
        if not conflicting:
            return result

        # 5. Para cada PR, merge-tree
        # F-4: DELETE files de PRs que ya no están conflicting
        # Primero obtener PRs que tenían files pero ya no conflicting
        all_prs_with_files = conn.execute(
            "SELECT DISTINCT pr_number FROM conflict_file"
        ).fetchall()
        conflicting_nums = {
            int(pr["number"]) for pr in conflicting
        }
        now = now_iso()
        for row in all_prs_with_files:
            pr_n = row["pr_number"]
            if pr_n not in conflicting_nums:
                # PR ya no está conflicting → marcar resolved
                conn.execute(
                    """UPDATE conflict_file
                       SET resolved_at = ?
                       WHERE pr_number = ?
                         AND resolved_at IS NULL""",
                    (now, pr_n),
                )

        # 6. Re-frescar archivos de PRs conflicting
        # F-4: DELETE+INSERT (no INSERT OR IGNORE acumulativo)
        for pr in conflicting:
            pr_num = int(pr["number"])
            refs = get_merge_refs(mirror, pr_num, repo_url)
            if not refs:
                result["errors"].append(
                    f"PR#{pr_num}: no refs found"
                )
                continue

            merge_base, main_ref, head = refs
            output = run_merge_tree(mirror, merge_base, main_ref, head)
            if output is None:
                result["errors"].append(
                    f"PR#{pr_num}: merge-tree failed"
                )
                continue

            files = parse_merge_tree(output)
            if not files:
                continue

            conflict_id = find_active_conflict_id(
                conn, pr_num,
            )

            # F-4: limpiar archivos anteriores de este PR
            # y re-insertar (patrón DELETE+INSERT)
            conn.execute(
                """DELETE FROM conflict_file
                   WHERE pr_number = ?
                     AND resolved_at IS NULL""",
                (pr_num,),
            )

            for fpath in files:
                conn.execute(
                    """INSERT INTO conflict_file
                       (pr_number, file_path,
                        conflict_id, detected_at)
                       VALUES (?, ?, ?, ?)""",
                    (pr_num, fpath, conflict_id, now),
                )
                result["files_detected"] += 1

            result["prs_enriched"] += 1

        conn.commit()
    finally:
        conn.close()

    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Conflict enricher: git merge-tree on read-only mirror"
    )
    parser.add_argument(
        "--db",
        default=os.environ.get(
            "DATABASE_PATH",
            str(ROOT / "data" / "control-plane.db"),
        ),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--mirror",
        default=os.environ.get(
            "ZOODASH_REPO_MIRROR",
            str(Path.home() / ".cache" / "zoodash" / "repo.git"),
        ),
        help="Path to read-only mirror",
    )
    parser.add_argument(
        "--repo-url",
        default=os.environ.get(
            "ZOODASH_REPO_URL",
            "https://github.com/Zoo-Code-Org/Zoo-Code.git",
        ),
        help="Repository URL for mirror clone",
    )
    args = parser.parse_args()

    if not Path(args.db).exists():
        print(f"Database not found: {args.db}", file=sys.stderr)
        sys.exit(1)

    mirror = Path(args.mirror)
    result = enrich_conflicts(args.db, mirror, args.repo_url)

    print(
        f"✅ Enricher complete: {result['prs_enriched']} PRs, "
        f"{result['files_detected']} files detected."
    )
    if result["errors"]:
        print(f"⚠️  Errors: {len(result['errors'])}")
        for err in result["errors"][:5]:
            print(f"   - {err}")


if __name__ == "__main__":
    main()
