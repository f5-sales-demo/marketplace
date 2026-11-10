#!/usr/bin/env bash
# Check shipped guidance for acceptance-critical contradictions.
set -euo pipefail

test_guidance_consistency() {
  python3 "$PLUGIN_ROOT/scripts/tests/test_guidance.py"
}
