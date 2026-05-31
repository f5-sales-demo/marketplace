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
    --include='*.md' --include='*.json' --include='*.mdx' |
    grep -v 'README.md' |
    grep -v '\$SF_ACCESS_TOKEN' |
    grep -v '\$SFDX_AUTH_URL' |
    grep -v 'force://\.\.\.' |
    grep -v 'force://fake' |
    grep -v 'force://PlatformCLI::YOUR_AUTH_TOKEN' |
    grep -v 'your-email@company.com' ||
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

# T1.14 — auth skill uses --sfdx-url-stdin (not file-based)
test_auth_uses_stdin_pipe() {
  local skill="$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md"
  local count
  count=$(grep -c 'sfdx-url-stdin' "$skill")
  [ "$count" -ge 2 ] || {
    echo "expected >=2 references to --sfdx-url-stdin, found $count"
    return 1
  }
}

# T1.15 — device flow documented as blocked
test_device_flow_blocked() {
  local skill="$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md"
  grep -qi 'blocked' "$skill" || {
    echo "device flow not documented as blocked"
    return 1
  }
  grep -qi 'device' "$skill" || {
    echo "no mention of device flow"
    return 1
  }
}
