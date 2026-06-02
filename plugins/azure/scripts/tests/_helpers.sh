#!/usr/bin/env bash
# Shared helpers for Azure Status plugin tests.
# Sourced by test files — not executed directly by run-tests.sh
# (the _ prefix prevents globbing by test_*.sh pattern).

# Detect an active Azure CLI session.
# Returns 0 if az CLI is installed and authenticated.
_detect_live_session() {
  command -v az >/dev/null 2>&1 || return 1
  az account show --output json >/dev/null 2>&1 || return 1
}
