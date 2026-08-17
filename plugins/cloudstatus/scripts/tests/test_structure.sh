#!/usr/bin/env bash
# Structural and xcsh contract validation.

set -euo pipefail

extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

frontmatter_keys() {
  extract_frontmatter "$1" | sed -n 's/^\([A-Za-z][A-Za-z0-9_-]*\):.*/\1/p'
}

test_plugin_metadata_is_consistent() {
  local plugin_json="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"
  local package_json="$PLUGIN_ROOT/package.json"
  local marketplace_json="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  local plugin_version package_version marketplace_version

  jq -e '.name == "cloudstatus" and .description and .author.name' "$plugin_json" >/dev/null
  plugin_version=$(jq -r '.version' "$plugin_json")
  package_version=$(jq -r '.version' "$package_json")
  marketplace_version=$(jq -r '.plugins[] | select(.name == "cloudstatus") | .version' "$marketplace_json")

  [ "$plugin_version" = "1.5.3" ] || {
    echo "plugin version is $plugin_version"
    return 1
  }
  [ "$package_version" = "$plugin_version" ] || {
    echo "package version is $package_version"
    return 1
  }
  [ "$marketplace_version" = "$plugin_version" ] || {
    echo "marketplace version is $marketplace_version"
    return 1
  }
  jq -e '.peerDependencies["@f5-sales-demo/xcsh"] == ">=20.19.0"' "$package_json" >/dev/null
}

test_expected_runtime_files_exist() {
  local files=(
    ".xcsh-plugin/plugin.json"
    "hooks/hooks.json"
    "skills/monitor/SKILL.md"
    "skills/monitor/references/commands.md"
    "skills/location/SKILL.md"
    "skills/location/references/correlation-rules.md"
    "skills/location/references/source-hints.md"
    "skills/network-intelligence/SKILL.md"
    "skills/network-intelligence/references/source-ladder.md"
    "skills/network-intelligence/references/query-playbook.md"
    "skills/network-intelligence/scripts/network_lookup.py"
    "extensions/regional-edge-guard.ts"
    "benchmarks/location-prompt-scenarios.json"
    "benchmarks/verify-location-prompt-trace.py"
    "scripts/evals/run-location-prompt-eval.sh"
    "agents/cloudstatus-status-operator.md"
    "agents/cloudstatus-network-operator.md"
    "commands/cloud-status.md"
  )

  local file
  for file in "${files[@]}"; do
    [ -f "$PLUGIN_ROOT/$file" ] || {
      echo "missing: $file"
      return 1
    }
  done
}

test_location_prompt_scenarios_cover_required_intents() {
  local scenarios="$PLUGIN_ROOT/benchmarks/location-prompt-scenarios.json"
  jq -e '
    .version == 1 and
    ([.scenarios[].id] | sort) == ["factual-metro", "factual-site-code", "factual-unresolved", "visual-address-us", "visual-canada", "visual-global", "visual-us"] and
    ([.scenarios[] | select(.intent == "visual")] | length) == 4 and
    ([.scenarios[] | select(.intent == "factual")] | length) == 3
  ' "$scenarios" >/dev/null
}

test_cloudstatus_declares_the_regional_edge_guard_extension() {
  jq -e '.xcsh.extensions == ["extensions/regional-edge-guard.ts"]' "$PLUGIN_ROOT/package.json" >/dev/null
}

test_skill_frontmatter_has_only_name_and_description() {
  local skill_file keys
  while IFS= read -r skill_file; do
    keys=$(frontmatter_keys "$skill_file" | sort | tr '\n' ' ')
    [ "$keys" = "description name " ] || {
      echo "unexpected frontmatter keys in ${skill_file#"$PLUGIN_ROOT/"}: $keys"
      return 1
    }
  done < <(find "$PLUGIN_ROOT/skills" -name SKILL.md -type f | sort)
}

test_cloud_status_is_status_only_and_references_installed_skill() {
  local command_file="$PLUGIN_ROOT/commands/cloud-status.md"
  grep -q 'cloudstatus:monitor' "$command_file" || {
    echo "monitor skill is not referenced"
    return 1
  }
  if grep -Eqi 'location|metro|facility|peering|network-intelligence' "$command_file"; then
    echo "/cloud-status contains non-status operations"
    return 1
  fi
}

test_all_namespaced_skill_resources_resolve() {
  python3 - "$PLUGIN_ROOT" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
files = [*root.glob("agents/*.md"), *root.glob("commands/*.md"), *root.glob("skills/**/*.md")]
pattern = re.compile(r"skill://cloudstatus:([a-z0-9-]+)(?:/([A-Za-z0-9._/-]+))?")
found = 0
for source in files:
    for skill, relative in pattern.findall(source.read_text()):
        found += 1
        target = root / "skills" / skill / (relative or "SKILL.md")
        if not target.is_file():
            raise SystemExit(f"{source.relative_to(root)}: unresolved skill resource {target.relative_to(root)}")
if found == 0:
    raise SystemExit("no skill://cloudstatus resources found")
PY
}

test_no_runtime_topology_or_address_dataset() {
  if find "$PLUGIN_ROOT" -type f \( \
    -iname '*matrix*.json' -o -iname '*topology*.json' -o \
    -iname '*address*.json' -o -iname '*gazetteer*' -o \
    -iname '*coordinate*.json' -o -iname '*location-cache*' -o \
    -iname '*inventory-snapshot*' \) | grep -q .; then
    echo "runtime topology, location, or address dataset exists"
    return 1
  fi

  local matches
  matches=$(grep -rIEn 'total_metros|total_edge_pops|total_registered_facilities|30[ -]metro|39[ -](edge|pop)|50[ -](registered|facilit)|VERIFIED|STRONG|CANDIDATE|METRO_ONLY|net[_ ]?id[^[:alnum:]]*10569|XCSH_LOCATION_MATRIX' \
    "$PLUGIN_ROOT" \
    --exclude-dir=tests \
    --exclude='README.md' || true)
  [ -z "$matches" ] || {
    echo "$matches"
    return 1
  }
}

test_locations_use_parent_render_map_contract() {
  local skill="$PLUGIN_ROOT/skills/location/SKILL.md"
  local network_skill="$PLUGIN_ROOT/skills/network-intelligence/SKILL.md"
  grep -q 'locations \[query\]' "$skill"
  grep -q 'parent xcsh' "$skill"
  grep -q '`render_map` exactly once' "$skill"
  grep -q 'Do not call `display_media` afterward' "$skill"
  grep -q 'locations --format map-v1' "$skill"
  grep -q 'CLOUDSTATUS_QUERY' "$skill"
  if grep -Eqi '^[[:space:]]*agent:|cloudstatus-network-operator|^[[:space:]]*tasks:' "$skill"; then
    echo "location workflow delegates or permits prohibited research"
    return 1
  fi
  if grep -Eq '^[[:space:]]*\|.*Regional Edge.*\|' "$network_skill" || grep -Eq 'network_lookup\.py (location|locations)' "$network_skill"; then
    echo "general network skill advertises Regional Edge handling"
    return 1
  fi
}

test_public_nominatim_endpoint_is_not_shipped() {
  ! grep -rIqi 'nominatim\.openstreetmap\.org' \
    "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/skills"
}

test_no_runtime_path_depends_on_plugin_cwd() {
  local matches
  matches=$(grep -rIEn '(Read|read|python3|bash)[[:space:]]+[`"]?(skills|scripts)/' \
    "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/commands" "$PLUGIN_ROOT/skills" \
    --include='*.md' || true)
  [ -z "$matches" ] || {
    echo "$matches"
    return 1
  }
}

test_hook_targets_f5_statuspage() {
  local hook="$PLUGIN_ROOT/hooks/hooks.json"
  jq -e '.hooks.SessionStart[0].hooks[0].type == "command"' "$hook" >/dev/null
  jq -e '.hooks.SessionStart[0].hooks[0].command | contains("https://www.f5cloudstatus.com/api/v2/status.json")' "$hook" >/dev/null
  if jq -r '.hooks.SessionStart[0].hooks[0].command' "$hook" | grep -q 'github.com'; then
    echo "startup check still targets GitHub"
    return 1
  fi
}
