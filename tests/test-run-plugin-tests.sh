#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKFLOW="$SOURCE_ROOT/.github/workflows/validate-plugins.yml"
INSTALLER="$SOURCE_ROOT/scripts/install-ci-bun.sh"
SETUP_ACTION="$SOURCE_ROOT/.github/actions/setup-plugin-tests/action.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

if grep -Fq 'bun_version=1.4.4' "$INSTALLER"; then
  pass "plugin CI uses current Bun 1.4.4"
else
  fail "plugin CI must use current Bun 1.4.4"
fi

uses_owned_bun_installer() {
  local workflow="$1" action="$2"
  grep -Fq 'uses: ./.github/actions/setup-plugin-tests' "$workflow" &&
    grep -Fq 'using: composite' "$action" &&
    grep -Fq 'run: ./scripts/install-ci-bun.sh' "$action" &&
    ! grep -Fq 'oven-sh/setup-bun' "$workflow" &&
    ! grep -Fq 'oven-sh/setup-bun' "$action"
}

if uses_owned_bun_installer "$WORKFLOW" "$SETUP_ACTION"; then
  pass "plugin CI uses the repository-owned Bun installer through isolated composite setup"
else
  fail "plugin CI must use isolated composite setup and avoid setup-bun's shared runner-home installation"
fi

printf 'uses: ./.github/actions/setup-plugin-tests\n' >"$WORK/setup-workflow.yml"
printf 'using: composite\nrun: ./scripts/install-ci-bun.sh\n' >"$WORK/setup-action.yml"
uses_owned_bun_installer "$WORK/setup-workflow.yml" "$WORK/setup-action.yml" ||
  fail "isolated composite installer fixture must pass"
for bad in shared-workflow shared-action missing-installer wrong-action not-composite; do
  cp "$WORK/setup-workflow.yml" "$WORK/bad-workflow.yml"
  cp "$WORK/setup-action.yml" "$WORK/bad-action.yml"
  case "$bad" in
  shared-workflow) printf 'uses: oven-sh/setup-bun\n' >>"$WORK/bad-workflow.yml" ;;
  shared-action) printf 'uses: oven-sh/setup-bun\n' >>"$WORK/bad-action.yml" ;;
  missing-installer) printf 'using: composite\n' >"$WORK/bad-action.yml" ;;
  wrong-action) printf 'uses: ./.github/actions/other\n' >"$WORK/bad-workflow.yml" ;;
  not-composite) printf 'run: ./scripts/install-ci-bun.sh\n' >"$WORK/bad-action.yml" ;;
  esac
  if uses_owned_bun_installer "$WORK/bad-workflow.yml" "$WORK/bad-action.yml"; then
    fail "invalid setup contract must reject: $bad"
  fi
done
pass "composite setup rejects shared installations and missing installer bindings"

if [ -x "$INSTALLER" ] &&
  grep -Fq 'RUNNER_TEMP' "$INSTALLER" &&
  grep -Fq 'bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c' \
    "$INSTALLER" &&
  grep -Fq 'baa6bb36f51d6e58561e02bbea825038a9df454f673d6d776e8bbf86f8c7850e' \
    "$INSTALLER"; then
  pass "Bun installer binds the verified artifact to runner temp"
else
  fail "Bun installer must be executable and verify the pinned artifact in runner temp"
fi

if grep -Fq 'node_gyp_version=13.0.2' "$INSTALLER" &&
  grep -Fq 'add --global --exact "node-gyp@${node_gyp_version}"' "$INSTALLER" &&
  grep -Fq 'node_gyp_actual=' "$INSTALLER"; then
  pass "Bun installer provides a pinned node-gyp outside the persistent runner home"
else
  fail "Bun installer must install and verify pinned node-gyp in runner temp"
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
  cp "$SOURCE_ROOT/scripts/resolve-plugin-runtime-package.cjs" "$root/scripts/resolve-plugin-runtime-package.cjs"
  for plugin in aws azure gcloud platform terraform github gitlab salesforce; do
    mkdir -p "$root/plugins/$plugin/.xcsh-plugin"
    cp "$SOURCE_ROOT/plugins/$plugin/.xcsh-plugin/plugin.json" "$root/plugins/$plugin/.xcsh-plugin/plugin.json"
    cp "$SOURCE_ROOT/plugins/$plugin/package.json" "$root/plugins/$plugin/package.json"
    cp "$SOURCE_ROOT/plugins/$plugin/bun.lock" "$root/plugins/$plugin/bun.lock"
  done
  printf '#!/bin/sh\nexit 0\n' >"$root/plugins/demo/scripts/tests/run-tests.sh"
  printf 'test("demo", () => {});\n' >"$root/plugins/demo/test/demo.test.ts"
  mkdir -p "$root/scripts/agent-validation-runtime"
  printf '{"name":"runner-fixture"}\n' >"$root/scripts/agent-validation-runtime/package.json"
  printf '{"lockfileVersion":2}\n' >"$root/scripts/agent-validation-runtime/bun.lock"
  cat >"$root/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "$*" "${PUPPETEER_SKIP_DOWNLOAD:-}" >>"$TEST_STATE/calls"
if [ "${1:-}" = install ]; then
  [ "${INSTALL_EXIT:-0}" = 0 ] || exit "$INSTALL_EXIT"
  if sdk=$(jq -er '.devDependencies["@f5-sales-demo/xcsh"] // empty' package.json); then
    for package in @f5-sales-demo/xcsh @f5-sales-demo/pi-ai @f5-sales-demo/pi-utils @anthropic-ai/sdk @agentclientprotocol/sdk @google/genai @sinclair/typebox bun-types; do
      case "$package" in
      @f5-sales-demo/xcsh | @f5-sales-demo/pi-ai | @f5-sales-demo/pi-utils) version="$sdk" ;;
      @anthropic-ai/sdk) version=0.124.0 ;;
      @agentclientprotocol/sdk) version=1.4.0 ;;
      @google/genai) version=2.21.0 ;;
      @sinclair/typebox) version=0.34.52 ;;
      bun-types) version=$(jq -er '.devDependencies["bun-types"] | ltrimstr("^")' package.json) ;;
      esac
      mkdir -p "node_modules/$package"
      jq -n --arg version "$version" '{version: $version}' >"node_modules/$package/package.json"
    done
  fi
  exit 0
fi
if [ "${1:-}" = test ] && [[ "$PWD" = */plugins/demo ]]; then touch "$TEST_STATE/test-ran"; fi
EOF
  printf '#!/bin/sh\nexit 0\n' >"$root/bin/python3"
  chmod +x "$root/bin/python3"
  chmod +x "$root/bin/bun" "$root/plugins/demo/scripts/tests/run-tests.sh"
  for tool in bash basename dirname find git grep jq ln mkdir mktemp rm sort env touch node; do
    ln -s "$(command -v "$tool")" "$root/tools/$tool"
  done
  printf '%s\n' "$root"
}

INSTALL_FAILURE=$(new_fixture install-failure)
printf '{"lockfileVersion":2}\n' >"$INSTALL_FAILURE/plugins/demo/bun.lock"
if PATH="$INSTALL_FAILURE/bin:$INSTALL_FAILURE/tools" \
  TEST_STATE="$INSTALL_FAILURE/state" INSTALL_EXIT=9 \
  bash "$INSTALL_FAILURE/scripts/run-plugin-tests.sh" >/dev/null 2>&1; then
  fail "an install failure must fail the runner"
fi
if [ -e "$INSTALL_FAILURE/state/test-ran" ]; then
  fail "bun tests must not run after an install failure"
else
  pass "an install failure stops before bun tests"
fi
if grep -Eq 'install( --force)? --frozen-lockfile\|(true|1)' "$INSTALL_FAILURE/state/calls"; then
  pass "dependency installs disable browser downloads"
else
  fail "dependency installs must set PUPPETEER_SKIP_DOWNLOAD=true"
fi

MISSING_LOCK=$(new_fixture missing-lock)
if PATH="$MISSING_LOCK/bin:$MISSING_LOCK/tools" TEST_STATE="$MISSING_LOCK/state" \
  bash "$MISSING_LOCK/scripts/run-plugin-tests.sh" >/dev/null 2>&1; then
  fail "a Bun-tested plugin without a lockfile must fail the runner"
fi
if [ -e "$MISSING_LOCK/state/test-ran" ]; then
  fail "the plugin's Bun tests must not run without its lockfile"
else
  pass "a missing plugin lockfile stops before that plugin's Bun tests"
fi

PARALLEL_AZURE=$(new_fixture parallel-azure)
printf '{"lockfileVersion":2}\n' >"$PARALLEL_AZURE/plugins/demo/bun.lock"
mkdir -p "$PARALLEL_AZURE/plugins/azure/scripts/tests" "$PARALLEL_AZURE/plugins/azure/test"
printf '#!/bin/sh\nexit 0\n' >"$PARALLEL_AZURE/plugins/azure/scripts/tests/run-tests.sh"
printf 'test("azure", () => {});\n' >"$PARALLEL_AZURE/plugins/azure/test/azure.test.ts"
if ! PATH="$PARALLEL_AZURE/bin:$PARALLEL_AZURE/tools" TEST_STATE="$PARALLEL_AZURE/state" \
  bash "$PARALLEL_AZURE/scripts/run-plugin-tests.sh" >"$PARALLEL_AZURE/state/output" 2>&1; then
  cat "$PARALLEL_AZURE/state/output" >&2
  fail "bounded Azure file workers must preserve the full runner workflow"
fi
if grep -Fq 'test . --parallel=1|' "$PARALLEL_AZURE/state/calls" &&
  ! grep -Eq -- '--concurrent|--no-isolate|--shard|--test-name-pattern' "$PARALLEL_AZURE/state/calls"; then
  pass "Azure executes its complete suite with one isolated file worker"
else
  fail "Azure must retain all tests, file isolation, and serial tests within each file"
fi
