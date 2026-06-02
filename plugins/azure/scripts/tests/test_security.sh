#!/usr/bin/env bash
# Phase 1: Security validation — no az CLI or session required.

set -euo pipefail

# T1.S1 — no hardcoded credentials in plugin files
test_no_hardcoded_credentials() {
  local patterns='password[[:space:]]*=|secret[[:space:]]*=|token=[A-Za-z0-9]|Bearer [A-Za-z0-9]{20,}'
  local matches
  matches=$(grep -rIin -E "$patterns" "$PLUGIN_ROOT" \
    --include='*.md' --include='*.json' --include='*.ts' \
    --exclude-dir=node_modules \
    --exclude-dir=.xcsh-plugin |
    grep -v 'AZURE_CLIENT_SECRET\|AWS_SECRET_ACCESS_KEY\|GOOGLE_APPLICATION_CREDENTIALS' |
    grep -v '\$[A-Z_]*TOKEN\|\$[A-Z_]*SECRET\|\$[A-Z_]*KEY' |
    grep -v 'sanitizeHintField\|placeholder\|example\|README' ||
    true)
  if [ -n "$matches" ]; then
    echo "Possible hardcoded credentials found:"
    echo "$matches"
    return 1
  fi
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
