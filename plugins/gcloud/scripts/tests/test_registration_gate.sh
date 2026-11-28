#!/usr/bin/env bash
# Verify actual registration-suite dispatch independently of its tool assertions.
set -euo pipefail

_gcloud_registration_gate_case() {
  local scenario="$1" fixture script marker outcome code
  fixture=$(mktemp -d)
  script="$PLUGIN_ROOT/scripts/tests/test_structure.sh"
  marker="$fixture/called"
  mkdir -p "$fixture/bin" "$fixture/workspace's scope/tests"
  printf '// synthetic dispatch fixture\n' >"$fixture/workspace's scope/tests/gcp-ce-runtime.test.ts"
  cat >"$fixture/bin/bun" <<'BUN'
#!/bin/sh
printf '%s\n' "$@" >"$GCP_REGISTRATION_GATE_MARKER"
exit "$GCP_REGISTRATION_GATE_RESULT"
BUN
  chmod 700 "$fixture/bin/bun"
  code=0
  case "$scenario" in
  failure) code=19 ;;
  missing-suite) rm "$fixture/workspace's scope/tests/gcp-ce-runtime.test.ts" ;;
  missing-bun) rm "$fixture/bin/bun" ;;
  esac
  if outcome=$(
    export MARKETPLACE_ROOT="$fixture/workspace's scope"
    export GCP_REGISTRATION_GATE_MARKER="$marker"
    export GCP_REGISTRATION_GATE_RESULT="$code"
    export PATH="$fixture/bin"
    # shellcheck disable=SC1090
    source "$script"
    test_T1_13_extension_registers_tools
  ); then code=0; else code=$?; fi
  case "$scenario" in
  failure)
    if [ "$code" -ne 19 ] || [ ! -f "$marker" ]; then
      rm -rf "$fixture"
      return 1
    fi
    ;;
  missing-suite | missing-bun)
    if [ "$code" -eq 0 ] || [ -f "$marker" ]; then
      rm -rf "$fixture"
      return 1
    fi
    ;;
  success)
    if [ "$code" -ne 0 ] || [ ! -f "$marker" ] || [[ "$outcome" = *SKIP:* ]]; then
      rm -rf "$fixture"
      return 1
    fi
    ;;
  esac
  if [ -f "$marker" ] && [ "$(cat "$marker")" != "$(printf 'test\n%s' "$fixture/workspace's scope/tests/gcp-ce-runtime.test.ts")" ]; then
    rm -rf "$fixture"
    return 1
  fi
  rm -rf "$fixture"
}
test_registration_gate_propagates_actual_failure() { _gcloud_registration_gate_case failure; }
test_registration_gate_requires_its_runtime_suite() { _gcloud_registration_gate_case missing-suite; }
test_registration_gate_requires_bun() { _gcloud_registration_gate_case missing-bun; }
test_registration_gate_preserves_exact_dispatch_and_success() { _gcloud_registration_gate_case success; }
