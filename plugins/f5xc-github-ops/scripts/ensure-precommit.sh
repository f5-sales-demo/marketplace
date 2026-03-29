#!/usr/bin/env bash
# Ensures pre-commit hooks are installed before any Bash tool use.
# Idempotent — only installs if .pre-commit-config.yaml exists and
# the pre-commit hook is missing.
#
# Works in both regular repositories and git worktrees. In a worktree
# .git is a pointer file, not a directory, so we use git rev-parse
# to resolve the correct hooks path.
#
# Exit codes:
#   0 — proceed (hooks installed or not applicable)
#   2 — block tool use (pre-commit CLI missing or install failed)

# No config file → nothing to do
[ -f .pre-commit-config.yaml ] || exit 0

# Not a git repo → nothing to do
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# pre-commit CLI not available → block
command -v pre-commit >/dev/null 2>&1 || {
  echo "BLOCKED: pre-commit CLI not found. Install it first."
  exit 2
}

# Resolve the hooks path (works in both repos and worktrees)
HOOK_PATH=$(git rev-parse --git-path hooks/pre-commit 2>/dev/null)

# Hooks already installed → nothing to do
[ -f "$HOOK_PATH" ] && exit 0

# Install hooks
pre-commit install || {
  echo "BLOCKED: pre-commit install failed."
  exit 2
}

exit 0
