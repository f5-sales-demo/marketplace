#!/usr/bin/env bash
# Rebuild and release ASM Migration after Renovate changes its dependency graph.
#
# Renovate invokes this from the repository root before it commits an npm update. The
# guard is intentionally based on the pending Git diff so the command is harmless for
# other package updates, including grouped Renovate branches.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ASM_PACKAGE="plugins/asm-migration/package.json"
ASM_LOCK="plugins/asm-migration/bun.lock"

cd "$REPO_ROOT"

if git diff --quiet HEAD -- "$ASM_PACKAGE" "$ASM_LOCK"; then
  echo "asm-migration refresh: no ASM dependency changes — skipping"
  exit 0
fi

command -v bun >/dev/null || {
  echo "asm-migration refresh: bun is required" >&2
  exit 1
}

(cd plugins/asm-migration && bun install --frozen-lockfile && bun run build)
"$REPO_ROOT/scripts/bump-version.sh" asm-migration patch

echo "asm-migration refresh: rebuilt runtime and bumped patch release"
