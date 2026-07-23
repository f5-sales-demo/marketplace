#!/usr/bin/env bash
# Mock gh CLI for benchmark scenarios.
#
# Priority 1 (mirrors mock-az.sh contract): emit $MOCK_GH_FIXTURE when set.
# Priority 2: emit $MOCK_GH_HELP when set.
# Priority 3: route by argv to a fixture under $GH_BENCH_FIXTURES.
#
# Argv routing exists because Bun resolves inherited-spawn binaries and env from
# the PATH/env captured at process startup and does not observe later
# process.env mutations. The unmodified tool layer spawns `gh` with inherited
# env, so it cannot pass MOCK_GH_FIXTURE per call; routing on the argv the tool
# actually sends keeps the mock deterministic.
if [ -n "$MOCK_GH_FIXTURE" ] && [ -f "$MOCK_GH_FIXTURE" ]; then
  cat "$MOCK_GH_FIXTURE"
  exit 0
fi

if [ -n "$MOCK_GH_HELP" ]; then
  echo "$MOCK_GH_HELP"
  exit 0
fi

args="$*"

case "$args" in
*--help*)
  echo "gh $args"
  exit 0
  ;;
esac

if [ -n "$GH_BENCH_FIXTURES" ]; then
  case "$args" in
  *"repo view"*)
    cat "$GH_BENCH_FIXTURES/repo-view.json"
    exit 0
    ;;
  *"issue view"*)
    cat "$GH_BENCH_FIXTURES/issue-view.json"
    exit 0
    ;;
  *"pr view"*)
    cat "$GH_BENCH_FIXTURES/pr-view.json"
    exit 0
    ;;
  *"pr diff"*)
    cat "$GH_BENCH_FIXTURES/pr-diff.txt"
    exit 0
    ;;
  *"search issues"*)
    cat "$GH_BENCH_FIXTURES/search-issues.json"
    exit 0
    ;;
  *"search prs"*)
    cat "$GH_BENCH_FIXTURES/search-prs.json"
    exit 0
    ;;
  *actions/runs/*/jobs*)
    cat "$GH_BENCH_FIXTURES/run-jobs.json"
    exit 0
    ;;
  *actions/runs*)
    cat "$GH_BENCH_FIXTURES/run-list.json"
    exit 0
    ;;
  esac
fi

echo "mock-gh: no fixture for args: $args" >&2
exit 1
