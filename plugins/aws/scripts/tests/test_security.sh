#!/usr/bin/env bash
# Phase 1: Security validation — no aws CLI or session required.

set -euo pipefail

# T1.S1 — no hardcoded credentials in plugin files
test_no_hardcoded_credentials() {
  python3 "$MARKETPLACE_ROOT/scripts/check-credential-literals.py" "$PLUGIN_ROOT"
}

test_hardcoded_credential_scanner_regressions() {
  python3 "$MARKETPLACE_ROOT/tests/test_credential_literals.py"
}

# T1.S2 — auth skill instructs never to echo credentials
test_auth_skill_no_echo_rule() {
  local skill="$PLUGIN_ROOT/skills/aws-auth/SKILL.md"
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
