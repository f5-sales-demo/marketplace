#!/usr/bin/env bash
set -euo pipefail

test_status_presentation_preserves_freshness_and_complete_updates() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_status_presentation.py"
}
