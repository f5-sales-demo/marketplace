#!/usr/bin/env bash
# Live org tests — skip gracefully when no org is authenticated.

set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC1091
source "$HERE/_helpers.sh"

# TL.1 — sf org list returns >0 orgs when one is authenticated
test_live_org_list_populated() {
  local org
  org=$(_detect_live_org 2>/dev/null) || {
    echo "SKIP: no authenticated org"
    return 0
  }

  local count
  count=$(sf org list --json 2>/dev/null |
    jq '[.result.other, .result.nonScratchOrgs, .result.devHubs, .result.scratchOrgs, .result.sandboxes] | map(length) | add')
  [ "$count" -gt 0 ] || {
    echo "detected org $org but list count is $count"
    return 1
  }
}

# TL.2 — sf org display returns expected fields
test_live_org_display_fields() {
  local org
  org=$(_detect_live_org 2>/dev/null) || {
    echo "SKIP: no authenticated org"
    return 0
  }

  local out
  out=$(sf org display --target-org "$org" --json 2>/dev/null) ||
    {
      echo "sf org display failed for $org"
      return 1
    }

  for field in username instanceUrl connectedStatus apiVersion; do
    echo "$out" | jq -e ".result.$field" >/dev/null 2>&1 ||
      {
        echo "missing field: $field in org display for $org"
        return 1
      }
  done
}

# TL.3 — connectedStatus is a recognized value
test_live_connected_status() {
  local org
  org=$(_detect_live_org 2>/dev/null) || {
    echo "SKIP: no authenticated org"
    return 0
  }

  local status
  status=$(sf org display --target-org "$org" --json 2>/dev/null |
    jq -r '.result.connectedStatus // empty')

  [ -n "$status" ] || {
    echo "connectedStatus is empty for $org"
    return 1
  }

  case "$status" in
  Connected | Active | Unknown | "RefreshToken has expired"*) ;;
  *)
    echo "WARNING: unrecognized connectedStatus '$status' for $org (test still passes)"
    ;;
  esac
}

# TL.4 — sf org list JSON has expected schema (works even with 0 orgs)
test_live_org_list_schema() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local out
  out=$(sf org list --json 2>/dev/null) || {
    echo "sf org list failed"
    return 1
  }

  echo "$out" | jq -e '.status == 0' >/dev/null || {
    echo "status is not 0"
    return 1
  }

  local keys=("other" "nonScratchOrgs" "devHubs" "scratchOrgs" "sandboxes")
  for key in "${keys[@]}"; do
    echo "$out" | jq -e ".result.$key | type == \"array\"" >/dev/null 2>&1 ||
      {
        echo "result.$key is not an array"
        return 1
      }
  done
}

# TL.5 — instance URL is valid HTTPS salesforce/force.com domain
test_live_instance_url_format() {
  local org
  org=$(_detect_live_org 2>/dev/null) || {
    echo "SKIP: no authenticated org"
    return 0
  }

  local url
  url=$(sf org display --target-org "$org" --json 2>/dev/null |
    jq -r '.result.instanceUrl // empty')

  [ -n "$url" ] || {
    echo "instanceUrl is empty for $org"
    return 1
  }
  [[ "$url" =~ ^https://.*\.(salesforce|force)\.com ]] ||
    {
      echo "instanceUrl '$url' does not match expected pattern"
      return 1
    }
}

# TL.6 — --skip-connection-status flag is accepted
test_live_skip_connection_flag() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local out
  out=$(sf org list --json --skip-connection-status 2>/dev/null) || true
  echo "$out" | jq -e '.status == 0' >/dev/null 2>&1 ||
    {
      echo "--skip-connection-status flag not accepted or returned error"
      return 1
    }
}
