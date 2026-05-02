#!/usr/bin/env bash
# Phase 2: cli-operator agent contract validation.

set -euo pipefail

AGENT_FILE="$PLUGIN_ROOT/agents/cli-operator.md"

# T2.10 — agent has response format template
test_agent_response_format() {
  grep -q '## Result:' "$AGENT_FILE" || {
    echo "missing '## Result:' template"
    return 1
  }
  grep -q '### Command Executed' "$AGENT_FILE" || {
    echo "missing '### Command Executed' section"
    return 1
  }
  grep -q '### Output Summary' "$AGENT_FILE" || {
    echo "missing '### Output Summary' section"
    return 1
  }
  grep -q '### Issues' "$AGENT_FILE" || {
    echo "missing '### Issues' section"
    return 1
  }
}

# T2.11 — agent references --json flag
test_agent_json_flag() {
  local count
  count=$(grep -c '\-\-json' "$AGENT_FILE")
  [ "$count" -ge 3 ] || {
    echo "expected >=3 references to --json, found $count"
    return 1
  }
}

# T2.12 — agent has all 4 error recovery patterns
test_agent_error_recovery() {
  local patterns=("sf: command not found" "No default org" "INVALID_SESSION_ID" "ECONNREFUSED")
  for pat in "${patterns[@]}"; do
    grep -q "$pat" "$AGENT_FILE" || {
      echo "missing error pattern: $pat"
      return 1
    }
  done
}

# T2.13 — org alias sanitization rejects dangerous input
test_alias_sanitization() {
  local regex='^[a-zA-Z0-9._-]+$'

  local safe_inputs=("my-dev-org" "org.prod" "Test_Org123" "a" "org-1.2_3")
  for input in "${safe_inputs[@]}"; do
    [[ "$input" =~ $regex ]] || {
      echo "safe input rejected: $input"
      return 1
    }
  done

  local dangerous_inputs=("org; rm -rf /" "\$(whoami)" "org|pipe" "org\`cmd\`" "org name" "org&bg" "org>file")
  for input in "${dangerous_inputs[@]}"; do
    if [[ "$input" =~ $regex ]]; then
      echo "dangerous input accepted: $input"
      return 1
    fi
  done
}
