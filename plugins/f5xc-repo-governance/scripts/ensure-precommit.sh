#!/usr/bin/env bash
# Ensures pre-commit hooks are installed before any Bash tool use.
# Idempotent — only installs if .pre-commit-config.yaml exists and
# .git/hooks/pre-commit is missing.
#
# Exit codes:
#   0 — proceed (hooks installed or not applicable)
#   2 — block tool use (pre-commit CLI missing or install failed)

# No config file → nothing to do
[ -f .pre-commit-config.yaml ] || exit 0

# pre-commit CLI not available → block
command -v pre-commit >/dev/null 2>&1 || {
  echo "BLOCKED: pre-commit CLI not found. Install it first."
  exit 2
}

# Hooks already installed → nothing to do
[ -f .git/hooks/pre-commit ] && exit 0

# Install hooks
pre-commit install || {
  echo "BLOCKED: pre-commit install failed."
  exit 2
}

exit 0
