#!/usr/bin/env bash
# Shared helpers for Salesforce plugin tests.
# Sourced by test files — not executed directly by run-tests.sh
# (the _ prefix prevents globbing by test_*.sh pattern).

# Detect any authenticated org via sf org list --json.
# Prints the alias (or username) of the first available org.
# Returns 1 if sf CLI is missing or no orgs are authenticated.
_detect_live_org() {
  command -v sf >/dev/null 2>&1 || return 1
  local out
  out=$(sf org list --json 2>/dev/null) || return 1
  local alias
  alias=$(echo "$out" | jq -r '
    [.result.nonScratchOrgs, .result.devHubs, .result.sandboxes,
     .result.scratchOrgs, .result.other]
    | map(select(. != null)) | flatten
    | map(.alias // .username)
    | map(select(. != null and . != ""))
    | first // empty
  ' 2>/dev/null) || return 1
  [ -n "$alias" ] && echo "$alias" || return 1
}
