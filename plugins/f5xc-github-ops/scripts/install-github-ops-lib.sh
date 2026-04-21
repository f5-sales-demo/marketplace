#!/usr/bin/env bash
# Idempotent installer for github-ops libs and runtime directories.
# Safe to run concurrently — uses flock on a lock file, with atomic
# rename for each installed file.
#
# Honors GITHUB_OPS_HOME (defaults to ~/.claude/github-ops).
# Source libs are located relative to CLAUDE_PLUGIN_ROOT if set,
# otherwise relative to this script.
#
# Exit codes: 0 success, 2 install failed.

set -euo pipefail

: "${GITHUB_OPS_HOME:=$HOME/.claude/github-ops}"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
src="${CLAUDE_PLUGIN_ROOT:-$(cd -- "$here/.." && pwd -P)}/scripts/libs"

mkdir -p "$GITHUB_OPS_HOME/lib" "$GITHUB_OPS_HOME/cache" "$GITHUB_OPS_HOME/state"

lock="$GITHUB_OPS_HOME/.install.lock"
exec 9>"$lock"

if ! flock -n 9; then
  exit 0
fi

install_one() {
  local name="$1"
  local dst="$GITHUB_OPS_HOME/lib/$name"
  local tmp
  tmp="$(mktemp "${dst}.XXXXXX")"
  cp "$src/$name" "$tmp"
  chmod +x "$tmp"
  mv -f "$tmp" "$dst"
}

install_one gh-poll.sh
install_one budget.sh
install_one retry.sh

exit 0
