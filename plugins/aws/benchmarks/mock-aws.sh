#!/usr/bin/env bash
# Mock aws CLI for benchmark scenarios.
#
# Priority 1 (mirrors the mock-gh.sh contract): emit $MOCK_AWS_FIXTURE when set.
# Priority 2: emit $MOCK_AWS_HELP when set.
# Priority 3: route by argv to a fixture under $AWS_BENCH_FIXTURES.
# Otherwise exit non-zero.
#
# Argv routing exists because Bun resolves inherited-spawn binaries and env from
# the PATH/env captured at process startup and does not observe later
# process.env mutations. The unmodified tool layer spawns `aws` with inherited
# env, so it cannot pass MOCK_AWS_FIXTURE per call; routing on the argv the tool
# actually sends keeps the mock deterministic.
if [ -n "$MOCK_AWS_FIXTURE" ] && [ -f "$MOCK_AWS_FIXTURE" ]; then
  cat "$MOCK_AWS_FIXTURE"
  exit 0
fi

if [ -n "$MOCK_AWS_HELP" ]; then
  echo "$MOCK_AWS_HELP"
  exit 0
fi

args="$*"

# The aws CLI exposes help via a trailing `help` subcommand (not a `--help`
# flag). Match it first so `ec2 describe-instances help` returns help text
# rather than the describe-instances fixture.
case "$args" in
*help*)
  echo "AWS CLI HELP: aws ${args% help}"
  echo "DESCRIPTION"
  echo "  Synthetic help output for benchmark scenarios."
  exit 0
  ;;
esac

if [ -n "$AWS_BENCH_FIXTURES" ]; then
  case "$args" in
  *get-caller-identity*)
    cat "$AWS_BENCH_FIXTURES/caller-identity.json"
    exit 0
    ;;
  *list-buckets*)
    cat "$AWS_BENCH_FIXTURES/list-buckets.json"
    exit 0
    ;;
  *describe-instances*)
    cat "$AWS_BENCH_FIXTURES/describe-instances.json"
    exit 0
    ;;
  esac
fi

echo "mock-aws: no fixture for args: $args" >&2
exit 1
