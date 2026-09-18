#!/usr/bin/env bash
# Phase 1: Security validation — no sf CLI or org required.

set -euo pipefail

# T1.11 — no hardcoded credentials in plugin or docs files
test_no_hardcoded_credentials() {
  local patterns='password[[:space:]]*=|secret[[:space:]]*=|token=[A-Za-z0-9]|Bearer [A-Za-z0-9]{20,}|force://[A-Za-z0-9]{10,}'
  local scan_dirs=("$PLUGIN_ROOT")
  local docs_dir="$MARKETPLACE_ROOT/docs/plugins"
  [ -f "$docs_dir/salesforce.mdx" ] && scan_dirs+=("$docs_dir/salesforce.mdx")

  local matches
  matches=$(grep -rIin -E "$patterns" "${scan_dirs[@]}" \
    --exclude-dir=node_modules \
    --include='*.md' --include='*.json' --include='*.mdx' |
    grep -v 'README.md' |
    grep -v '\$SF_ACCESS_TOKEN' |
    grep -v '\$SFDX_AUTH_URL' |
    grep -v 'force://\.\.\.' |
    grep -v 'force://fake' |
    grep -v 'force://PlatformCLI::YOUR_AUTH_TOKEN' |
    grep -v 'your-email@example.com' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded credentials found:"
    echo "$matches"
    return 1
  fi
}

# T1.12 — auth skill instructs never to echo credentials
test_auth_skill_no_echo_rule() {
  local skill="$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md"
  grep -qi 'never echo' "$skill" || {
    echo "auth skill missing 'Never echo' instruction"
    return 1
  }
}

# T1.13 — cli-operator agent has input sanitization regex
test_agent_sanitization_regex() {
  local agent="$PLUGIN_ROOT/agents/cli-operator.md"
  grep -q '\^.a-zA-Z0-9._-' "$agent" || {
    echo "cli-operator missing sanitization regex"
    return 1
  }
}

# T1.14 — the generic setup login keeps interactive input off argv
test_auth_uses_stdin_pipe() {
  grep -q "stdin: 'inherit'" "$PLUGIN_ROOT/src/index.ts" || {
    echo "Salesforce login step must inherit stdin"
    return 1
  }
}

# T1.15 — unsupported device login is absent from the setup plan
test_device_flow_blocked() {
  if grep -q "'login', 'device'" "$PLUGIN_ROOT/src/index.ts"; then
    echo "unsupported Salesforce device login remains in the setup plan"
    return 1
  fi
}
