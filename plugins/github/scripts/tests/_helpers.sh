#!/usr/bin/env bash
# Shared helpers for GitHub plugin tests.
# Sourced by test files — not executed directly by run-tests.sh
# (the _ prefix prevents globbing by test_*.sh pattern).

# Detect an active GitHub CLI session.
# Returns 0 if gh CLI is installed and authenticated.
_detect_live_session() {
  command -v gh >/dev/null 2>&1 || return 1
  gh auth status >/dev/null 2>&1 || return 1
}
