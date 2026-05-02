#!/usr/bin/env bash
# Cross-file consistency tests — no sf CLI or org required
# (except test_delegation_sf_commands_valid which needs sf CLI).

set -euo pipefail

AUTH_SKILL="$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md"
INDEX_SKILL="$PLUGIN_ROOT/skills/salesforce-index/SKILL.md"
AGENT_FILE="$PLUGIN_ROOT/agents/cli-operator.md"
LOGIN_CMD="$PLUGIN_ROOT/commands/sf-login.md"
STATUS_CMD="$PLUGIN_ROOT/commands/sf-status.md"

# TI.1 — sf-login.md and salesforce-auth delegation priority order match
test_login_auth_priority_match() {
  local login_order auth_order

  login_order=$(grep -oP 'sf org login \K[a-z-]+' "$LOGIN_CMD" | head -4)
  auth_order=$(grep -A2 'Pick the first\|first fully satisfied' "$AUTH_SKILL" |
    grep -oP 'sf org login \K[a-z-]+' || true)

  if [ -z "$auth_order" ]; then
    auth_order=$(awk '/## Delegation/,/^##[^#]/' "$AUTH_SKILL" |
      grep -oP 'sf org login \K[a-z-]+')
  fi

  local login_first auth_first
  login_first=$(echo "$login_order" | head -1)
  auth_first=$(echo "$auth_order" | head -1)

  [ "$login_first" = "$auth_first" ] || {
    echo "priority mismatch: sf-login starts with '$login_first', salesforce-auth starts with '$auth_first'"
    return 1
  }
}

# TI.2 — salesforce-index routing table skill names are valid identifiers
test_routing_table_skills_valid() {
  local skills
  skills=$(awk '/afv-library Skill/,/^###/' "$INDEX_SKILL" |
    grep '`' |
    grep -oP '`\K[a-z][-a-z0-9]*(?=`)' || true)

  [ -n "$skills" ] || {
    echo "no skill names found in routing table"
    return 1
  }

  local count=0
  while IFS= read -r skill; do
    [[ "$skill" =~ ^[a-z][-a-z0-9]*$ ]] || {
      echo "invalid skill name: $skill"
      return 1
    }
    count=$((count + 1))
  done <<<"$skills"

  [ "$count" -ge 10 ] || {
    echo "expected >=10 skills in routing table, found $count"
    return 1
  }
}

# TI.3 — sf-status.md delegation commands are in cli-operator
test_status_commands_in_agent() {
  local cmds
  cmds=$(grep -oP 'sf (org|project|apex) \S+' "$STATUS_CMD" | sort -u)

  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    local base
    base=$(echo "$cmd" | awk '{print $1, $2, $3}')
    grep -qF "$base" "$AGENT_FILE" || grep -qF "$(echo "$base" | awk '{print $2, $3}')" "$AGENT_FILE" ||
      {
        echo "command '$cmd' from sf-status.md not found in cli-operator agent"
        return 1
      }
  done <<<"$cmds"
}

# TI.4 — sf-login.md delegation commands reference valid sf subcommands
test_login_commands_in_agent() {
  local login_cmds
  login_cmds=$(grep -oP 'sf org (login \S+|list|display)' "$LOGIN_CMD" | sort -u)

  [ -n "$login_cmds" ] || {
    echo "no sf commands found in sf-login.md"
    return 1
  }

  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    case "$cmd" in
    "sf org login"* | "sf org list" | "sf org display") ;;
    *)
      echo "unexpected command in sf-login.md: $cmd"
      return 1
      ;;
    esac
  done <<<"$login_cmds"
}

# TI.5 — both command files reference cli-operator agent
test_delegations_reference_agent() {
  grep -qi 'cli-operator' "$LOGIN_CMD" || {
    echo "sf-login.md does not reference cli-operator"
    return 1
  }
  grep -qi 'cli-operator' "$STATUS_CMD" || {
    echo "sf-status.md does not reference cli-operator"
    return 1
  }
}

# TI.6 — salesforce-auth env var table covers all 6 expected variables
test_auth_env_var_coverage() {
  local expected_vars=(SF_ACCESS_TOKEN SFDX_AUTH_URL SF_ORG_INSTANCE_URL SF_JWT_KEY_FILE SF_CLIENT_ID SF_USERNAME)

  for var in "${expected_vars[@]}"; do
    grep -qF "$var" "$AUTH_SKILL" || {
      echo "salesforce-auth missing env var: $var"
      return 1
    }
  done
}

# TI.7 — sf subcommands referenced in delegation exist in sf CLI
test_delegation_sf_commands_valid() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local subcommands
  subcommands=$(cat "$LOGIN_CMD" "$STATUS_CMD" "$AUTH_SKILL" |
    grep -oP 'sf (org|project|apex) \S+' |
    sed 's/ --.*//; s/ \\$//' |
    sort -u)

  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    local topic subcmd
    topic=$(echo "$cmd" | awk '{print $2}')
    subcmd=$(echo "$cmd" | awk '{print $3}')
    [ -z "$subcmd" ] && continue

    sf "$topic" "$subcmd" --help >/dev/null 2>&1 ||
      {
        echo "sf $topic $subcmd is not a valid sf CLI subcommand"
        return 1
      }
  done <<<"$subcommands"
}

# TI.8 — audit --sfdx-url-stdin usage across plugin
test_sfdx_url_stdin_syntax_audit() {
  local total bare correct
  total=$(grep -rc -- '--sfdx-url-stdin' "$PLUGIN_ROOT" --include='*.md' 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
  correct=$(grep -rcP -- '--sfdx-url-stdin\s*=' "$PLUGIN_ROOT" --include='*.md' 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
  bare=$((total - correct))

  if [ "$bare" -gt 0 ]; then
    echo "WARNING: $bare bare --sfdx-url-stdin references found (should use --sfdx-url-stdin=-). $correct correct."
  fi
}

# TI.9 — cli-operator security rules cover auth skill security rules
test_auth_security_rules_in_agent() {
  grep -qi 'echo' "$AGENT_FILE" || {
    echo "cli-operator missing 'echo' security rule"
    return 1
  }
  grep -qi 'credential\|token\|secret' "$AGENT_FILE" || {
    echo "cli-operator missing credential protection rule"
    return 1
  }
  grep -qi 'sanitize' "$AGENT_FILE" || {
    echo "cli-operator missing sanitization rule"
    return 1
  }
  grep -qi 'deploy\|destructive' "$AGENT_FILE" || {
    echo "cli-operator missing deployment safety rule"
    return 1
  }

  grep -q 'disallowedTools' "$AGENT_FILE" || {
    echo "cli-operator missing disallowedTools (prevents file writes)"
    return 1
  }
}
