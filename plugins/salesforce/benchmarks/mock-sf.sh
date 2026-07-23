#!/usr/bin/env bash
# Mock sf CLI for benchmark scenarios.
#
# Priority 1 (mirrors the mock-glab.sh contract): emit $MOCK_SF_FIXTURE when set.
# Priority 2: emit $MOCK_SF_HELP when set.
# Priority 3: route by argv to a fixture under $SF_BENCH_FIXTURES.
# Otherwise: exit non-zero.
#
# Argv routing exists because Bun resolves inherited-spawn binaries and env from
# the PATH/env captured at process startup and does not observe later
# process.env mutations. The unmodified tool layer (src/tools/shared.ts ->
# makeExecApi) spawns `sf` with inherited env, so it cannot pass MOCK_SF_FIXTURE
# per call; routing on the argv the tool actually sends keeps the mock
# deterministic across scenarios.
if [ -n "$MOCK_SF_FIXTURE" ] && [ -f "$MOCK_SF_FIXTURE" ]; then
  cat "$MOCK_SF_FIXTURE"
  exit 0
fi

if [ -n "$MOCK_SF_HELP" ]; then
  echo "$MOCK_SF_HELP"
  exit 0
fi

args="$*"

case "$args" in
*--help*)
  echo "sf $args"
  exit 0
  ;;
esac

if [ -n "$SF_BENCH_FIXTURES" ]; then
  case "$args" in
  *"data query"*)
    cat "$SF_BENCH_FIXTURES/data-query.json"
    exit 0
    ;;
  *"org display"*)
    cat "$SF_BENCH_FIXTURES/org-display.json"
    exit 0
    ;;
  *"org list"*)
    cat "$SF_BENCH_FIXTURES/org-list.json"
    exit 0
    ;;
  esac
fi

echo "mock-sf: no fixture for args: $args" >&2
exit 1
