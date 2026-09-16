#!/usr/bin/env bash

test_kvm_prompt_eval_runs_from_installed_cache() {
  local work cache plugin platform mock_bin state
  work=$(mktemp -d)
  cache="$work/cache"
  plugin="$cache/plugins/f5-sales-demo-marketplace___kvm___test"
  platform="$cache/plugins/f5-sales-demo-marketplace___platform___test"
  mock_bin="$work/bin"
  state="$work/state"
  mkdir -p "$plugin/scripts/evals" "$plugin/benchmarks" "$platform/.xcsh-plugin" "$mock_bin" "$state"
  printf '{"name":"platform"}\n' >"$platform/.xcsh-plugin/plugin.json"
  cp "$PLUGIN_ROOT/scripts/evals/run-smsv2-prompt-eval.sh" "$plugin/scripts/evals/"
  cp "$PLUGIN_ROOT/benchmarks/smsv2-prompt-scenarios.json" "$plugin/benchmarks/"

  printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' \
    'if [ "${1:-}" = plugin ] && [ "${2:-}" = list ]; then' \
    '  printf "{\"marketplace\":[{\"id\":\"platform@f5-sales-demo-marketplace\",\"entries\":[{\"installedAt\":\"2026-09-16T00:00:00.000Z\",\"installPath\":\"%s\"}]}]}\n" "$PLATFORM_DIR"' \
    '  exit 0' \
    'fi' \
    'printf "%s\\n" "$@" >"$TEST_STATE/xcsh-args"' \
    'printf "{\"type\":\"tool_execution_start\",\"toolName\":\"f5xc_ce_v2_capabilities\"}\n"' \
    >"$mock_bin/xcsh"
  printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' \
    'printf "%s\\n" "$@" >"$TEST_STATE/bun-args"' >"$mock_bin/bun"
  chmod +x "$mock_bin/xcsh" "$mock_bin/bun"

  PATH="$mock_bin:$PATH" PLATFORM_DIR="$platform" TEST_STATE="$state" \
    bash "$plugin/scripts/evals/run-smsv2-prompt-eval.sh" inspect-health-traffic

  grep -Fx -- '--plugin-dir' "$state/xcsh-args" >/dev/null || return 1
  grep -Fx -- "$platform" "$state/xcsh-args" >/dev/null || return 1
  grep -Fx -- "$plugin/benchmarks/verify-smsv2-prompt-trace.ts" "$state/bun-args" >/dev/null || return 1
  rm -rf "$work"
}
