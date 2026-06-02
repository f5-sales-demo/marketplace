#!/usr/bin/env bash
# Shared helpers for GitLab plugin tests.
# Sourced by test files — not executed directly by run-tests.sh
# (the _ prefix prevents globbing by test_*.sh pattern).

# Detect an active GitLab CLI session.
# Returns 0 if glab CLI is installed and authenticated.
_detect_live_session() {
  command -v glab >/dev/null 2>&1 || return 1
  glab auth status >/dev/null 2>&1 || return 1
}
