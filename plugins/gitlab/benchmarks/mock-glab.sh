#!/usr/bin/env bash
# Mock glab CLI for benchmark scenarios.
#
# Priority 1 (mirrors mock-gh.sh contract): emit $MOCK_GLAB_FIXTURE when set.
# Priority 2: emit $MOCK_GLAB_HELP when set.
# Priority 3: route by argv to a fixture under $GLAB_BENCH_FIXTURES.
#
# Argv routing exists because Bun resolves inherited-spawn binaries and env from
# the PATH/env captured at process startup and does not observe later
# process.env mutations. The unmodified tool layer spawns `glab` with inherited
# env, so it cannot pass MOCK_GLAB_FIXTURE per call; routing on the argv the tool
# actually sends keeps the mock deterministic.
if [ -n "$MOCK_GLAB_FIXTURE" ] && [ -f "$MOCK_GLAB_FIXTURE" ]; then
  cat "$MOCK_GLAB_FIXTURE"
  exit 0
fi

if [ -n "$MOCK_GLAB_HELP" ]; then
  echo "$MOCK_GLAB_HELP"
  exit 0
fi

args="$*"

case "$args" in
*--help*)
  echo "glab $args"
  exit 0
  ;;
esac

if [ -n "$GLAB_BENCH_FIXTURES" ]; then
  case "$args" in
  *graphql*)
    cat "$GLAB_BENCH_FIXTURES/search-graphql.json"
    exit 0
    ;;
  *"issue view"*)
    cat "$GLAB_BENCH_FIXTURES/issue-view.json"
    exit 0
    ;;
  *--search*)
    cat "$GLAB_BENCH_FIXTURES/search.json"
    exit 0
    ;;
  *"issue list"*)
    cat "$GLAB_BENCH_FIXTURES/issue-list.json"
    exit 0
    ;;
  esac
fi

echo "mock-glab: no fixture for args: $args" >&2
exit 1
