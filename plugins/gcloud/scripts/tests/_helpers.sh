#!/usr/bin/env bash
# Shared helpers for GCloud Status plugin tests.
# Sourced by test files — not executed directly by run-tests.sh
# (the _ prefix prevents globbing by test_*.sh pattern).

# Detect an active Google Cloud CLI session.
# Returns 0 if gcloud CLI is installed and authenticated.
_detect_live_session() {
  command -v gcloud >/dev/null 2>&1 || return 1
  gcloud auth print-access-token --quiet >/dev/null 2>&1 || return 1
}
