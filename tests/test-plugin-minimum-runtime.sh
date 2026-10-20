#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/repo/plugins/aws/.xcsh-plugin" "$WORK/repo/benchmarks" "$WORK/bin" "$WORK/logs"
cp "$ROOT/plugins/aws/package.json" "$WORK/repo/plugins/aws/package.json"
cp "$ROOT/plugins/aws/.xcsh-plugin/plugin.json" "$WORK/repo/plugins/aws/.xcsh-plugin/plugin.json"
printf 'original lock\n' >"$WORK/repo/plugins/aws/bun.lock"
mkdir "$WORK/repo/plugins/aws/node_modules"
printf 'preserve original graph\n' >"$WORK/repo/plugins/aws/node_modules/sentinel"
cat >"$WORK/bin/bun" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
install)
  [ "$PWD" != "$ORIGINAL_PLUGIN" ]
  [ ! -e node_modules/sentinel ]
  [ ! -e bun.lock ]
  [ "${2:-}" = --ignore-scripts ]
  mkdir -p node_modules/@f5-sales-demo/xcsh
  jq '{version: .devDependencies["@f5-sales-demo/xcsh"]}' package.json >node_modules/@f5-sales-demo/xcsh/package.json
  ;;
test)
  for cli in aws az gcloud gh glab sf; do ! command -v "$cli" >/dev/null; done
  [ "$(jq -er '.devDependencies["@f5-sales-demo/xcsh"]' package.json)" = "$EXPECTED_MINIMUM" ]
  touch "$TEST_MARKER"
  exit "${MOCK_TEST_EXIT:-0}"
  ;;
*) exit 2 ;;
esac
MOCK
chmod +x "$WORK/bin/bun"
# Exercise the runner contract without requiring rsync in the shell-unit image.
# Real minimum qualification still uses the production rsync executable.
cat >"$WORK/bin/rsync" <<'MOCK'
#!/usr/bin/env python3
import shutil
import sys

assert sys.argv[1:-2] == ['-a', '--exclude=node_modules', '--exclude=.git']
shutil.copytree(sys.argv[-2], sys.argv[-1], dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('node_modules', '.git'))
MOCK
chmod +x "$WORK/bin/rsync"
export ORIGINAL_PLUGIN="$WORK/repo/plugins/aws"
export EXPECTED_MINIMUM
EXPECTED_MINIMUM=$(jq -er '.minimumRuntimeVersion' "$ORIGINAL_PLUGIN/.xcsh-plugin/plugin.json")
export TEST_MARKER="$WORK/test-ran"
cp "$ORIGINAL_PLUGIN/package.json" "$WORK/before.json"
PATH="$WORK/bin:$PATH" TMPDIR="$WORK/logs" REPO_ROOT="$WORK/repo" \
  bash "$ROOT/scripts/run-plugin-minimum-runtime.sh" aws
[ -e "$TEST_MARKER" ]
cmp "$WORK/before.json" "$ORIGINAL_PLUGIN/package.json"
[ "$(cat "$ORIGINAL_PLUGIN/bun.lock")" = 'original lock' ]
[ "$(cat "$ORIGINAL_PLUGIN/node_modules/sentinel")" = 'preserve original graph' ]
if PATH="$WORK/bin:$PATH" TMPDIR="$WORK/logs" MOCK_TEST_EXIT=7 REPO_ROOT="$WORK/repo" \
  bash "$ROOT/scripts/run-plugin-minimum-runtime.sh" aws >"$WORK/failure.log" 2>&1; then
  echo 'FAIL: minimum lane swallowed test failure' >&2
  exit 1
fi
if bash "$ROOT/scripts/run-plugin-minimum-runtime.sh" '../aws' >/dev/null 2>&1; then exit 1; fi
printf 'PASS: exact minimum, CLI exclusions, original graph preservation and failure propagation\n'
