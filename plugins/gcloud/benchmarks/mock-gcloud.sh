#!/usr/bin/env bash
# Mock gcloud CLI for benchmark scenarios.
#
# Priority 1 (mirrors the mock-gh.sh contract): emit $MOCK_GCLOUD_FIXTURE when set.
# Priority 2: emit $MOCK_GCLOUD_HELP when set.
# Priority 3: route by argv to a fixture under $GCLOUD_BENCH_FIXTURES.
# Priority 4: pass an auth/spot-check path through to the REAL gcloud on the
#             preserved original PATH ($GCLOUD_BENCH_ORIG_PATH).
# Otherwise exit non-zero.
#
# Argv routing exists because Bun resolves inherited-spawn binaries and env from
# the PATH/env captured at process startup and does not observe later
# process.env mutations. The unmodified tool layer spawns `gcloud` with inherited
# env, so it cannot pass MOCK_GCLOUD_FIXTURE per call; routing on the argv the
# tool actually sends keeps the mock deterministic.
if [ -n "$MOCK_GCLOUD_FIXTURE" ] && [ -f "$MOCK_GCLOUD_FIXTURE" ]; then
  cat "$MOCK_GCLOUD_FIXTURE"
  exit 0
fi

if [ -n "$MOCK_GCLOUD_HELP" ]; then
  echo "$MOCK_GCLOUD_HELP"
  exit 0
fi

args="$*"

# The gcloud CLI exposes help via a `--help` flag. Match it first so a help
# request returns help text rather than a fixture.
case "$args" in
*--help*)
  echo "GCLOUD CLI HELP: gcloud ${args%% --help*}"
  echo "DESCRIPTION"
  echo "  Synthetic help output for benchmark scenarios."
  exit 0
  ;;
esac

if [ -n "$GCLOUD_BENCH_FIXTURES" ]; then
  case "$args" in
  *config*list*)
    cat "$GCLOUD_BENCH_FIXTURES/config-list.json"
    exit 0
    ;;
  *projects*list*)
    cat "$GCLOUD_BENCH_FIXTURES/projects-list.json"
    exit 0
    ;;
  *compute*instances*list*)
    cat "$GCLOUD_BENCH_FIXTURES/compute-instances-list.json"
    exit 0
    ;;
  esac
fi

# Auth/spot-check passthrough: reach the real gcloud via the preserved original
# PATH so the live spot-check in scenarios.ts can exercise a genuine binary
# without the mock's fixtures shadowing it.
case "$args" in
*auth*print-access-token* | *auth*list*)
  if [ -n "$GCLOUD_BENCH_ORIG_PATH" ]; then
    real_gcloud="$(PATH="$GCLOUD_BENCH_ORIG_PATH" command -v gcloud)"
    if [ -n "$real_gcloud" ]; then
      exec "$real_gcloud" "$@"
    fi
  fi
  ;;
esac

echo "mock-gcloud: no fixture for args: $args" >&2
exit 1
