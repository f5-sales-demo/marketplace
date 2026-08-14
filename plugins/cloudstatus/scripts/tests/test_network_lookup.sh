#!/usr/bin/env bash

set -euo pipefail

test_network_lookup_unit_suite() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_network_lookup.py" -v
}
