#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKFLOW="$SOURCE_ROOT/.github/workflows/validate-plugins.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

if grep -Fq 'bun-version: 1.3.14' "$WORKFLOW"; then
  pass "plugin CI uses current Bun 1.3.14"
else
  fail "plugin CI must use current Bun 1.3.14"
fi

missing_locks=()
for plugin_dir in "$SOURCE_ROOT"/plugins/*; do
  if find "$plugin_dir" -name '*.test.ts' -not -path '*/node_modules/*' -print -quit | grep -q . &&
    [ ! -f "$plugin_dir/bun.lock" ]; then
    missing_locks+=("${plugin_dir##*/}")
  fi
done
if [ "${#missing_locks[@]}" -eq 0 ]; then
  pass "every Bun-tested plugin has a frozen lockfile"
else
  fail "Bun-tested plugins are missing lockfiles: ${missing_locks[*]}"
fi

new_fixture() {
  local name="$1"
  local root="$WORK/$name"
  mkdir -p \
    "$root/scripts" \
    "$root/plugins/demo/scripts/tests" \
    "$root/plugins/demo/test" \
    "$root/bin" \
    "$root/tools" \
    "$root/state"
  cp "$SOURCE_ROOT/scripts/run-plugin-tests.sh" "$root/scripts/run-plugin-tests.sh"
  cp "$SOURCE_ROOT/scripts/check-plugin-runtime-dependencies.sh" \
    "$root/scripts/check-plugin-runtime-dependencies.sh"
  for plugin in aws azure gcloud github gitlab salesforce; do
    mkdir -p "$root/plugins/$plugin"
    cp "$SOURCE_ROOT/plugins/$plugin/package.json" "$root/plugins/$plugin/package.json"
    cp "$SOURCE_ROOT/plugins/$plugin/bun.lock" "$root/plugins/$plugin/bun.lock"
  done
  printf '#!/bin/sh\nexit 0\n' > "$root/plugins/demo/scripts/tests/run-tests.sh"
  printf 'test("demo", () => {});\n' > "$root/plugins/demo/test/demo.test.ts"
  printf '#!/bin/sh\nset -eu\nprintf "%%s|%%s\\n" "$*" "${PUPPETEER_SKIP_DOWNLOAD:-}" >>"$TEST_STATE/calls"\nif [ "${1:-}" = install ]; then exit "${INSTALL_EXIT:-0}"; fi\nif [ "${1:-}" = test ]; then touch "$TEST_STATE/test-ran"; fi\n' > "$root/bin/bun"
  chmod +x "$root/bin/bun" "$root/plugins/demo/scripts/tests/run-tests.sh"
  for tool in bash basename dirname find git grep jq ln mktemp rm sort; do
    ln -s "$(command -v "$tool")" "$root/tools/$tool"
  done
  printf '%s\n' "$root"
}

INSTALL_FAILURE=$(new_fixture install-failure)
printf '{"lockfileVersion":1}\n' > "$INSTALL_FAILURE/plugins/demo/bun.lock"
if PATH="$INSTALL_FAILURE/bin:$INSTALL_FAILURE/tools" \
  TEST_STATE="$INSTALL_FAILURE/state" INSTALL_EXIT=9 \
  bash "$INSTALL_FAILURE/scripts/run-plugin-tests.sh" > /dev/null 2>&1; then
  fail "an install failure must fail the runner"
fi
if [ -e "$INSTALL_FAILURE/state/test-ran" ]; then
  fail "bun tests must not run after an install failure"
else
  pass "an install failure stops before bun tests"
fi
if grep -Fq 'install --frozen-lockfile|true' "$INSTALL_FAILURE/state/calls"; then
  pass "dependency installs disable browser downloads"
else
  fail "dependency installs must set PUPPETEER_SKIP_DOWNLOAD=true"
fi

MISSING_LOCK=$(new_fixture missing-lock)
if PATH="$MISSING_LOCK/bin:$MISSING_LOCK/tools" TEST_STATE="$MISSING_LOCK/state" \
  bash "$MISSING_LOCK/scripts/run-plugin-tests.sh" > /dev/null 2>&1; then
  fail "a Bun-tested plugin without a lockfile must fail the runner"
fi
if [ -e "$MISSING_LOCK/state/test-ran" ]; then
  fail "bun tests must not run without a lockfile"
else
  pass "a missing lockfile stops before bun tests"
fi
