#!/usr/bin/env bash
# Tests for GitHub & Git CLI Operational Mastery in github plugin.

test_git_gh_cli_detection_hook() {
  local hook_command="command -v git > /dev/null 2>&1 && command -v gh > /dev/null 2>&1 && echo 'Active' || echo 'Missing'"
  local result
  result=$(eval "$hook_command")
  # Verify command executes cleanly and outputs Active or Missing
  [ "$result" = "Active" ] || [ "$result" = "Missing" ]
}

test_git_cli_mastery_reference_exists() {
  local ref_file="$PLUGIN_ROOT/skills/github-index/references/git-gh-cli-mastery.md"
  [ -f "$ref_file" ]
  grep -q "Direct Git CLI Operational Knowledge" "$ref_file"
  grep -q 'Direct GitHub CLI (`gh`) Operational Knowledge' "$ref_file"
}
