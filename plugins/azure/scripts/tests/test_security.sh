#!/usr/bin/env bash
# Phase 1: Security validation — no az CLI or session required.

set -euo pipefail

# T1.S1 — no hardcoded credentials in plugin files
test_no_hardcoded_credentials() {
  python3 "$(dirname -- "${BASH_SOURCE[0]}")/_credential_literals.py" "$PLUGIN_ROOT"
}

test_hardcoded_credential_scanner_regressions() {
  python3 "$(dirname -- "${BASH_SOURCE[0]}")/test_credential_literals.py"
}

# T1.S2 — auth skill instructs never to echo credentials
test_auth_skill_no_echo_rule() {
  local skill="$PLUGIN_ROOT/skills/azure-auth/SKILL.md"
  grep -qi 'never echo' "$skill" || {
    echo "auth skill missing 'Never echo' instruction"
    return 1
  }
}

# T1.S3 — cli-operator agent has input sanitization regex
test_agent_sanitization_regex() {
  local agent="$PLUGIN_ROOT/agents/cli-operator.md"
  grep -q '\^.a-zA-Z0-9' "$agent" || {
    echo "cli-operator missing sanitization regex"
    return 1
  }
}

# T1.S4 — bootstrap material is never accepted as a plan field or CLI argument
test_ce_secret_boundary() {
  grep -q 'f5xc-ce:' "$PLUGIN_ROOT/src/ce/token-consumer.ts" || {
    echo "opaque bootstrap reference validation is missing"
    return 1
  }
  grep -q "assertSecurePath(tokenPath, 0o600" "$PLUGIN_ROOT/src/ce/token-consumer.ts" || {
    echo "bootstrap file mode validation is missing"
    return 1
  }
  if grep -rIin -E -- "--custom-data[= ][^']*(token|secret)|--tags[^']*(token|secret)" "$PLUGIN_ROOT/src" --include='*.ts'; then
    echo "bootstrap material may enter Azure command arguments or tags"
    return 1
  fi
}
