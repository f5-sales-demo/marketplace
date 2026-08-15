#!/usr/bin/env bash
# Phase 1: Security validation — no API or org required.

set -euo pipefail

# T1.11 — no hardcoded API tokens in plugin files
test_no_hardcoded_api_tokens() {
  local patterns='F5XC_API_TOKEN=[A-Za-z0-9]|APIToken [A-Za-z0-9]{20,}|Bearer [A-Za-z0-9]{20,}'
  local matches
  matches=$(grep -rIin -E "$patterns" "$PLUGIN_ROOT" \
    --exclude-dir=node_modules \
    --include='*.md' --include='*.json' --include='*.ts' |
    grep -v 'README.md' |
    grep -v '\$F5XC_API_TOKEN' |
    grep -v '\${F5XC_API_TOKEN' |
    grep -v 'APIToken \$' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded API tokens found:"
    echo "$matches"
    return 1
  fi
}

# T1.14 — CE bootstrap references use the session-owned single-use store
test_ce_bootstrap_secret_boundary() {
  grep -q 'mode: 0o600' "$PLUGIN_ROOT/src/ce/token-store.ts" || {
    echo "CE bootstrap token files are not created with mode 0600"
    return 1
  }
  grep -q 'f5xc-ce://' "$PLUGIN_ROOT/src/ce/token-store.ts" || {
    echo "CE bootstrap tool does not return opaque references"
    return 1
  }
  grep -q 'assertSecretFree' "$PLUGIN_ROOT/src/tools/f5xc-ce-v2-site.ts" || {
    echo "CE site plans do not reject secret fields"
    return 1
  }
}

# T1.12 — no credential echo in agent files
test_no_credential_echo_in_agents() {
  local agents_dir="$PLUGIN_ROOT/agents"
  local matches
  matches=$(grep -rIin -E 'echo.*\$F5XC_API_TOKEN|echo.*\$F5XC_API_URL.*TOKEN|print.*TOKEN' "$agents_dir" \
    --exclude-dir=node_modules \
    --include='*.md' ||
    true)

  if [ -n "$matches" ]; then
    echo "Credential echo found in agent files:"
    echo "$matches"
    return 1
  fi
}

# T1.13 — no eval of user input in agent files
test_no_eval_user_input() {
  local agents_dir="$PLUGIN_ROOT/agents"
  local matches
  matches=$(grep -rIin -E 'eval.*\$|eval.*user|eval.*input' "$agents_dir" \
    --exclude-dir=node_modules \
    --include='*.md' ||
    true)

  if [ -n "$matches" ]; then
    echo "Eval of user input found in agent files:"
    echo "$matches"
    return 1
  fi
}
