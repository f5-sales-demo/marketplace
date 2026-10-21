#!/usr/bin/env bash
# Exercise the exact shipped local status collector.
set -euo pipefail

test_status_collector_fixtures() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_status.py"
}
