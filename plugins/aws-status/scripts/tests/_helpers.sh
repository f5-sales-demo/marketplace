#!/usr/bin/env bash
# Shared helpers for AWS Status plugin tests.
# Sourced by test files — not executed directly by run-tests.sh
# (the _ prefix prevents globbing by test_*.sh pattern).

# Detect an active AWS CLI session.
# Returns 0 if aws CLI is installed and authenticated.
_detect_live_session() {
  command -v aws >/dev/null 2>&1 || return 1
  aws sts get-caller-identity --output json >/dev/null 2>&1 || return 1
}
