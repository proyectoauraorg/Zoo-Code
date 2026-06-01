#!/usr/bin/env sh
# =============================================================================
# UPSTREAM GUARD — Branch-independent protection
# =============================================================================
# This script blocks ZooDash proprietary content from being pushed to
# Zoo-Code-Org (upstream). It is installed into .git/hooks/ via
# `pnpm prepare` and runs regardless of which branch is active.
#
# Protected paths: apps/dashboard/, ingest/, deploy/, docs/dashboard/,
#                  CLAUDE.md, zZooContrib.code-workspace
#
# Exclusive to: proyectoauraorg/Zoo-Code.git (origin)
# =============================================================================

remote="$1"
url="$2"

# Only guard pushes to upstream (Zoo-Code-Org)
if ! echo "$url" | grep -qi "Zoo-Code-Org"; then
  exit 0
fi

# Get list of commits being pushed
# pre-push receives: local_ref local_sha remote_ref remote_sha
while read -r local_ref local_sha remote_ref remote_sha; do
  # Skip delete pushes
  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # For new branches, compare against the merge-base with main
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    base=$(git merge-base origin/main "$local_sha" 2>/dev/null || echo "")
    if [ -z "$base" ]; then
      base="$local_sha~20"
    fi
    changed_files=$(git diff --name-only "$base".."$local_sha" 2>/dev/null)
  else
    changed_files=$(git diff --name-only "$remote_sha".."$local_sha" 2>/dev/null)
  fi

  # Check for protected paths
  PROTECTED_PATHS="apps/dashboard/ ingest/ deploy/ docs/dashboard/ CLAUDE.md zZooContrib.code-workspace"
  blocked=""

  for pattern in $PROTECTED_PATHS; do
    if echo "$changed_files" | grep -q "^${pattern}"; then
      blocked="$blocked\n    - $pattern"
    fi
  done

  if [ -n "$blocked" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║  🚫 BLOCKED: ZooDash proprietary content → upstream rejected       ║"
    echo "║                                                                      ║"
    echo "║  ZooDash is EXCLUSIVE to proyectoauraorg/Zoo-Code.git               ║"
    echo "║  The following protected paths were detected in pushed commits:      ║"
    printf "%b\n" "$blocked"
    echo "║                                                                      ║"
    echo "║  Fix: push to 'origin' (proyectoauraorg) instead of 'upstream'.     ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
  fi
done

exit 0
