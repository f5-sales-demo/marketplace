#!/usr/bin/env bash
# Phase 1: Security validation — no external dependencies required.

set -euo pipefail

# T1.11 — no hardcoded credentials in agent or skill files
test_no_hardcoded_credentials() {
  local patterns='password[[:space:]]*=|secret[[:space:]]*=|token=[A-Za-z0-9]|Bearer [A-Za-z0-9]{20,}|api_key=[A-Za-z0-9]'
  local matches
  matches=$(grep -rIin -E "$patterns" "$PLUGIN_ROOT" \
    --exclude-dir=node_modules \
    --include='*.md' --include='*.json' |
    grep -v 'README.md' |
    grep -v 'schema/' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded credentials found:"
    echo "$matches"
    return 1
  fi
}

# Identity-bearing examples must be visibly synthetic. Plausible names are not
# acceptable test data because their provenance cannot be established later.
test_identity_examples_use_reserved_placeholders() {
  local deal="$PLUGIN_ROOT/schema/example-deal.json"
  local values invalid

  values=$(jq -r '
    [
      .metadata.reviewer,
      (.stakeholders[] | .name, .relationshipOwner),
      (.closePlan.criticalActions[].owner | sub(" \\([^)]*\\)$"; "")),
      (.team.internal[].name),
      (.team.partner[].name)
    ] | .[]
  ' "$deal")
  invalid=$(grep -Ev '^<[A-Z][A-Z0-9_]*>$' <<<"$values" || true)
  if [ -n "$invalid" ]; then
    echo "Identity examples must use <RESERVED_PLACEHOLDER> values:"
    printf '%s\n' "$invalid"
    return 1
  fi

  local account_team_description
  account_team_description=$(jq -r '.properties.metadata.properties.accountTeam.description' \
    "$PLUGIN_ROOT/schema/meddpicc-schema.json")
  if grep -Eq '[A-Z][a-z]{2,}[[:space:]]+[A-Z][a-z]{2,}' <<<"$account_team_description"; then
    echo "accountTeam schema documentation contains a plausible person name"
    return 1
  fi
}

test_identity_schema_documents_role_aliases() {
  jq -e '
    [
      .properties.metadata.properties.accountTeam.description,
      .properties.metadata.properties.reviewer.description,
      .properties.stakeholders.items.properties.name.description,
      .properties.stakeholders.items.properties.relationshipOwner.description,
      .properties.closePlan.properties.criticalActions.items.properties.owner.description,
      .properties.team.properties.internal.items.properties.name.description,
      .properties.team.properties.partner.items.properties.name.description
    ]
    | all(type == "string" and test("alias"; "i") and test("full names"; "i"))
  ' "$PLUGIN_ROOT/schema/meddpicc-schema.json" >/dev/null || {
    echo "Every identity-bearing schema field must require aliases and prohibit full names"
    return 1
  }
}

test_identity_output_templates_use_alias_labels() {
  local unsafe
  unsafe=$(grep -rIin -E '\[(Contact Name|Name|Account Name|Customer Name|Your Company)\]' \
    --include='*.md' \
    "$PLUGIN_ROOT/README.md" \
    "$PLUGIN_ROOT/agents" \
    "$PLUGIN_ROOT/commands" \
    "$PLUGIN_ROOT/skills" || true)
  if [ -n "$unsafe" ]; then
    echo "Identity-bearing output templates must use role or organization aliases:"
    printf '%s\n' "$unsafe"
    return 1
  fi
}
