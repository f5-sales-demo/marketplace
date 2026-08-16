#!/usr/bin/env bash
# Hermetic xcsh JSONL acceptance-contract suite.

set -euo pipefail

test_location_prompt_trace_suite() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_location_prompt_trace.py" -v
}
