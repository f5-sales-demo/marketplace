#!/usr/bin/env bash

set -euo pipefail

extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

frontmatter_value() {
  extract_frontmatter "$1" | grep "^${2}:" | head -1
}

test_plugin_manifest_and_catalog_match() {
  local plugin="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"
  local package_json="$PLUGIN_ROOT/package.json"
  local catalog="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  jq -e '.name == "github" and .description and .version and .author.name' "$plugin" >/dev/null
  local plugin_version package_version catalog_version
  plugin_version=$(jq -r '.version' "$plugin")
  package_version=$(jq -r '.version' "$package_json")
  catalog_version=$(jq -r '.plugins[] | select(.name == "github") | .version' "$catalog")
  [ "$package_version" = "$plugin_version" ]
  [ "$plugin_version" = "$catalog_version" ]
  jq -e '.xcsh.version == "3.1.0" and .peerDependencies["@f5-sales-demo/xcsh"] == ">=21.39.1"' \
    "$package_json" >/dev/null
  jq -e '.plugins[] | select(.name == "github") | .source == "./plugins/github"' "$catalog" >/dev/null
}

test_fresh_install_authorizes_idempotent_setup() {
  for plugin in github xorg kvm; do
    jq -e '.lifecycle.setupRequired == true and .lifecycle.setupAuthorization == "install"' \
      "$MARKETPLACE_ROOT/plugins/$plugin/.xcsh-plugin/plugin.json" >/dev/null
  done
}

test_github_lifecycle_uat_scenarios_cover_every_stage_and_override() {
  local scenarios="$PLUGIN_ROOT/benchmarks/github-lifecycle-prompt-scenarios.json"
  jq -e '
    ([.[].expected.actions[]] | unique | sort) == (["cleanup", "monitor", "prepare", "publish", "repair", "status"] | sort)
    and ([.[].expected.advisories[]] | unique | sort) == ([
      "github.cleanup_without_merge_proof",
      "github.custom_branch",
      "github.direct_publication",
      "github.issue_omitted",
      "github.auto_merge_disabled",
      "github.stage_all"
    ] | sort)
  ' "$scenarios" >/dev/null
}

test_github_lifecycle_uat_advisories_match_runtime_codes() {
  local scenarios="$PLUGIN_ROOT/benchmarks/github-lifecycle-prompt-scenarios.json"
  local workflow="$PLUGIN_ROOT/src/tools/github-workflow.ts"
  while IFS= read -r action; do
    grep -Fq "'$action'" "$workflow" || {
      echo "synthesized UAT expects a lifecycle action absent from runtime: $action"
      return 1
    }
  done < <(jq -r '.[].expected.actions[]' "$scenarios" | sort -u)
  while IFS= read -r code; do
    grep -Fq "'$code'" "$workflow" || {
      echo "synthesized UAT expects an advisory code absent from runtime: $code"
      return 1
    }
  done < <(jq -r '.[].expected.advisories[]' "$scenarios" | sort -u)
}

test_skill_frontmatter() {
  for skill_dir in github-index github-auth workflow-lifecycle; do
    local skill="$PLUGIN_ROOT/skills/$skill_dir/SKILL.md"
    [ -n "$(frontmatter_value "$skill" name)" ]
    [ -n "$(frontmatter_value "$skill" description)" ]
  done
}

test_extension_registers_typed_lifecycle_tools() {
  local workflow="$PLUGIN_ROOT/src/tools/github-workflow.ts"
  [ -f "$workflow" ]
  for name in github_workflow github_issue_create github_pr_create github_pr_auto_merge \
    github_pr_update_branch github_worktree_prepare github_worktree_cleanup; do
    grep -q "'$name'" "$workflow" || {
      echo "missing typed tool: $name"
      return 1
    }
  done
  grep -q 'Bun.spawn(\[command.command, ...command.args\]' "$workflow"
}

test_governance_is_advisory() {
  local workflow="$PLUGIN_ROOT/src/tools/github-workflow.ts"
  grep -q 'advisories:' "$workflow"
  grep -q 'github.cleanup_without_merge_proof' "$workflow"
  if grep -Rq 'GITHUB_ALLOW_MUTATIONS\|headless-blocked\|findMutation' "$PLUGIN_ROOT/src"; then
    echo "blocking mutation guard remains"
    return 1
  fi
  [ ! -e "$PLUGIN_ROOT/hooks/hooks.json" ]
  [ ! -e "$PLUGIN_ROOT/scripts/ensure-precommit.sh" ]
}

test_extension_entrypoint() {
  local package_file="$PLUGIN_ROOT/package.json"
  local extension
  extension=$(jq -r '.xcsh.extensions[0] // empty' "$package_file")
  [ -n "$extension" ]
  [ -f "$PLUGIN_ROOT/$extension" ]
  grep -q 'export default' "$PLUGIN_ROOT/src/index.ts"
}

test_agents_and_commands_exist() {
  [ -f "$PLUGIN_ROOT/agents/cli-operator.md" ]
  [ -f "$PLUGIN_ROOT/agents/github-ops.md" ]
  [ -f "$PLUGIN_ROOT/commands/github-ops-status.md" ]
}
