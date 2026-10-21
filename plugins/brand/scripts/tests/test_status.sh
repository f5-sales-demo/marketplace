#!/usr/bin/env bash
# Execute shipped status guidance against harmless local reference fixtures.
set -euo pipefail

test_status_collector_fixtures() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_status.py"
}
