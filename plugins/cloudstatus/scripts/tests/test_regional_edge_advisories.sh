#!/usr/bin/env bash
# Hermetic runtime-policy tests for the plugin extension.

set -euo pipefail

test_regional_edge_advisory_suite() {
  (
    cd "$MARKETPLACE_ROOT"
    bun test "./plugins/cloudstatus/scripts/tests/test_regional_edge_advisories.ts" --max-concurrency 2
  )
}
