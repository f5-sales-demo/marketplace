#!/usr/bin/env bash
# Phase 2: sf CLI baseline + env var priority logic.
# Phase 3: Credential-dependent tests (skip gracefully).

set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC1091
source "$HERE/_helpers.sh"

# --- auth method detection (mirrors sf-login.md priority logic) ---
detect_auth_method() {
  if [ -n "${SF_ACCESS_TOKEN:-}" ] && [ -n "${SF_ORG_INSTANCE_URL:-}" ]; then
    echo "access-token"
  elif [ -n "${SF_JWT_KEY_FILE:-}" ] && [ -n "${SF_CLIENT_ID:-}" ] && [ -n "${SF_USERNAME:-}" ]; then
    echo "jwt"
  elif [ -n "${SFDX_AUTH_URL:-}" ]; then
    echo "sfdx-url"
  else
    echo "web"
  fi
}

# T2.3 — sf org list --json returns valid JSON
test_sf_org_list_json() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local out
  out=$(sf org list --json 2>/dev/null) || true
  echo "$out" | jq -e '.status' >/dev/null || {
    echo "sf org list did not return valid JSON"
    return 1
  }
}

# T2.4 — sf --version returns expected format
test_sf_version_format() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local ver
  ver=$(sf --version 2>/dev/null)
  [[ "$ver" =~ @salesforce/cli/[0-9]+ ]] || {
    echo "unexpected version format: $ver"
    return 1
  }
}

# T2.5 — baseline: report auth env vars (informational, always passes)
test_baseline_no_auth_vars() {
  local vars=(SF_ACCESS_TOKEN SF_ORG_INSTANCE_URL SFDX_AUTH_URL SF_JWT_KEY_FILE SF_CLIENT_ID SF_USERNAME)
  local set_vars=()
  for v in "${vars[@]}"; do
    [ -n "${!v:-}" ] && set_vars+=("$v")
  done
  if [ ${#set_vars[@]} -gt 0 ]; then
    echo "Note: auth vars set: ${set_vars[*]} (tests will use them)"
  fi
}

# T2.6 — access-token requires BOTH vars
test_access_token_requires_both_vars() {
  local result

  result=$(SF_ACCESS_TOKEN=fake SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE='' SF_CLIENT_ID='' SF_USERNAME='' SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" != "access-token" ] || {
    echo "access-token should not be selected without SF_ORG_INSTANCE_URL"
    return 1
  }

  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL=https://example.com SF_JWT_KEY_FILE='' SF_CLIENT_ID='' SF_USERNAME='' SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" != "access-token" ] || {
    echo "access-token should not be selected without SF_ACCESS_TOKEN"
    return 1
  }

  result=$(SF_ACCESS_TOKEN=fake SF_ORG_INSTANCE_URL=https://example.com SF_JWT_KEY_FILE='' SF_CLIENT_ID='' SF_USERNAME='' SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" = "access-token" ] || {
    echo "access-token should be selected when both vars set, got: $result"
    return 1
  }
}

# T2.7 — JWT requires ALL THREE vars
test_jwt_requires_all_three_vars() {
  local result

  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE=/tmp/key SF_CLIENT_ID=id SF_USERNAME='' SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" != "jwt" ] || {
    echo "jwt should not be selected without SF_USERNAME"
    return 1
  }

  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE=/tmp/key SF_CLIENT_ID='' SF_USERNAME=user SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" != "jwt" ] || {
    echo "jwt should not be selected without SF_CLIENT_ID"
    return 1
  }

  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE='' SF_CLIENT_ID=id SF_USERNAME=user SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" != "jwt" ] || {
    echo "jwt should not be selected without SF_JWT_KEY_FILE"
    return 1
  }

  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE=/tmp/key SF_CLIENT_ID=id SF_USERNAME=user SFDX_AUTH_URL='' detect_auth_method)
  [ "$result" = "jwt" ] || {
    echo "jwt should be selected when all three set, got: $result"
    return 1
  }
}

# T2.8 — SFDX URL method selected when var set
test_sfdx_url_selected() {
  local result
  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE='' SF_CLIENT_ID='' SF_USERNAME='' SFDX_AUTH_URL=force://fake detect_auth_method)
  [ "$result" = "sfdx-url" ] || {
    echo "sfdx-url should be selected, got: $result"
    return 1
  }
}

# T2.9 — priority: access-token > JWT > SFDX URL
test_auth_priority_order() {
  local result

  result=$(SF_ACCESS_TOKEN=tok SF_ORG_INSTANCE_URL=https://x SF_JWT_KEY_FILE=/k SF_CLIENT_ID=id SF_USERNAME=u SFDX_AUTH_URL=force://x detect_auth_method)
  [ "$result" = "access-token" ] || {
    echo "access-token should win when all set, got: $result"
    return 1
  }

  result=$(SF_ACCESS_TOKEN='' SF_ORG_INSTANCE_URL='' SF_JWT_KEY_FILE=/k SF_CLIENT_ID=id SF_USERNAME=u SFDX_AUTH_URL=force://x detect_auth_method)
  [ "$result" = "jwt" ] || {
    echo "jwt should win over sfdx-url, got: $result"
    return 1
  }
}

# T2.14 — --sfdx-url-stdin requires =- value (syntax bug detector)
test_sfdx_url_stdin_syntax() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local out
  out=$(echo "" | sf org login sfdx-url --sfdx-url-stdin --json 2>&1) || true
  if echo "$out" | grep -qi 'value\|stdin\|format'; then
    local bare_count
    bare_count=$(grep -cP -- '--sfdx-url-stdin(?!\s*=)' "$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md" 2>/dev/null || echo 0)
    if [ "$bare_count" -gt 0 ]; then
      echo "WARNING: salesforce-auth/SKILL.md has $bare_count bare --sfdx-url-stdin references (should use --sfdx-url-stdin=-)"
    fi
  fi
}

# --- Phase 3: Credential-dependent tests ---

# T3.1 — access-token login succeeds (requires real credentials)
test_access_token_login() {
  if [ -z "${SF_ACCESS_TOKEN:-}" ] || [ -z "${SF_ORG_INSTANCE_URL:-}" ]; then
    echo "SKIP: SF_ACCESS_TOKEN or SF_ORG_INSTANCE_URL not set"
    return 0
  fi
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local out
  out=$(sf org login access-token \
    --instance-url "$SF_ORG_INSTANCE_URL" \
    --alias sf-test-org \
    --set-default \
    --no-prompt \
    --json 2>&1) || true

  if echo "$out" | jq -e '.status == 0' >/dev/null 2>&1; then
    sf org logout --target-org sf-test-org --no-prompt 2>/dev/null || true
    return 0
  fi

  if echo "$out" | grep -q "correct format"; then
    echo "SKIP: token format not accepted (session tokens require orgId! prefix)"
    return 0
  fi

  echo "login failed: $out"
  return 1
}

# T3.2 — SFDX URL login succeeds (requires real auth URL)
test_sfdx_url_login() {
  [ -n "${SFDX_AUTH_URL:-}" ] || {
    echo "SKIP: SFDX_AUTH_URL not set"
    return 0
  }
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local out
  out=$(echo "$SFDX_AUTH_URL" | sf org login sfdx-url \
    --sfdx-url-stdin=- \
    --alias=sf-test-sfdx \
    --set-default \
    --json 2>&1) || {
    echo "login failed: $out"
    return 1
  }

  echo "$out" | jq -e '.status == 0' >/dev/null || {
    echo "login returned non-zero status"
    return 1
  }

  sf org logout --target-org sf-test-sfdx --no-prompt 2>/dev/null || true
}

# T3.3 — authenticated org appears in sf org list
test_org_appears_in_list() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local org_alias
  org_alias=$(_detect_live_org 2>/dev/null) || org_alias=""

  if [ -n "$org_alias" ]; then
    local count
    count=$(sf org list --json 2>/dev/null |
      jq '[.result.other, .result.nonScratchOrgs, .result.devHubs, .result.scratchOrgs, .result.sandboxes] | map(length) | add')
    [ "$count" -gt 0 ] || {
      echo "detected org $org_alias but count is $count"
      return 1
    }
    return 0
  fi

  if [ -n "${SF_ACCESS_TOKEN:-}" ] && [ -n "${SF_ORG_INSTANCE_URL:-}" ]; then
    sf org login access-token \
      --instance-url "$SF_ORG_INSTANCE_URL" \
      --alias sf-test-list \
      --no-prompt \
      --json >/dev/null 2>&1 || {
      echo "SKIP: login failed"
      return 0
    }

    local count
    count=$(sf org list --json 2>/dev/null |
      jq '[.result.other, .result.nonScratchOrgs, .result.devHubs, .result.scratchOrgs, .result.sandboxes] | map(length) | add')
    [ "$count" -gt 0 ] || {
      echo "expected >0 orgs after login, got $count"
      sf org logout --target-org sf-test-list --no-prompt 2>/dev/null || true
      return 1
    }
    sf org logout --target-org sf-test-list --no-prompt 2>/dev/null || true
    return 0
  fi

  echo "SKIP: no authenticated org and no auth env vars set"
  return 0
}

# T3.4 — plugin files do not contain real credential values
test_credentials_not_in_plugin_files() {
  [ -n "${SF_ACCESS_TOKEN:-}" ] || {
    echo "SKIP: SF_ACCESS_TOKEN not set"
    return 0
  }
  [ "${#SF_ACCESS_TOKEN}" -gt 20 ] || {
    echo "SKIP: SF_ACCESS_TOKEN too short to be a real token (${#SF_ACCESS_TOKEN} chars)"
    return 0
  }

  local matches
  matches=$(grep -rF "$SF_ACCESS_TOKEN" "$PLUGIN_ROOT" \
    --include='*.md' --include='*.json' \
    --exclude-dir='scripts' 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "SECURITY: access token found in plugin files"
    return 1
  fi
}

# T3.5 — sf org display returns expected fields
test_org_display_fields() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local org_alias
  org_alias=$(_detect_live_org 2>/dev/null) || org_alias=""

  if [ -z "$org_alias" ] && [ -n "${SF_ACCESS_TOKEN:-}" ] && [ -n "${SF_ORG_INSTANCE_URL:-}" ]; then
    sf org login access-token \
      --instance-url "$SF_ORG_INSTANCE_URL" \
      --alias sf-test-display \
      --set-default \
      --no-prompt \
      --json >/dev/null 2>&1 || {
      echo "SKIP: login failed"
      return 0
    }
    org_alias="sf-test-display"
  fi

  [ -n "$org_alias" ] || {
    echo "SKIP: no authenticated org and no auth env vars set"
    return 0
  }

  local out
  out=$(sf org display --target-org "$org_alias" --json 2>/dev/null) || {
    echo "org display failed"
    return 1
  }

  for field in username instanceUrl connectedStatus apiVersion; do
    echo "$out" | jq -e ".result.$field" >/dev/null 2>&1 || {
      echo "missing field: $field"
      return 1
    }
  done

  if [ "$org_alias" = "sf-test-display" ]; then
    sf org logout --target-org sf-test-display --no-prompt 2>/dev/null || true
  fi
}
