#!/usr/bin/env bash
# Execute the real bounded collector against local HTTP fixtures.
set -euo pipefail

test_status_collector_fixtures() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_status.py"
}
