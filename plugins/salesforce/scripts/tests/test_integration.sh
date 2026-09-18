#!/usr/bin/env bash
set -euo pipefail

MANIFEST="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"
SOURCE="$PLUGIN_ROOT/src/index.ts"
AUTH_SKILL="$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md"

test_lifecycle_declares_one_salesforce_integration() {
  jq -e '
    .lifecycle.mode == "integrated"
    and .lifecycle.integrations == ["salesforce"]
    and .lifecycle.setupRequired == true
    and .lifecycle.collectedData == ["accounts", "identifiers", "business_profile"]
  ' "$MANIFEST" >/dev/null
}

test_authentication_routes_to_generic_human_setup() {
  grep -q 'xcsh plugin setup salesforce' "$AUTH_SKILL" || {
    echo "salesforce-auth does not route to the canonical setup command"
    return 1
  }
  ! grep -Eq '^sf org login|^echo .*sf org login' "$AUTH_SKILL" || {
    echo "salesforce-auth still exposes a direct login command"
    return 1
  }
}

test_setup_plan_uses_exact_argv_without_fake_requirements() {
  grep -q "argv: \['sf', 'org', 'login', 'web'" "$SOURCE" || {
    echo "Salesforce setup plan does not declare exact login argv"
    return 1
  }
  grep -q 'requiredEnvironment: \[\]' "$SOURCE" || {
    echo "Salesforce web login must not claim optional environment variables are required"
    return 1
  }
}

test_legacy_setup_surfaces_are_absent() {
  for path in \
    "$PLUGIN_ROOT/commands/sf-login.md" \
    "$PLUGIN_ROOT/commands/sf-status.md" \
    "$PLUGIN_ROOT/src/tools/sf-setup.ts" \
    "$PLUGIN_ROOT/src/wizard.ts"; do
    [ ! -e "$path" ] || {
      echo "legacy setup surface remains: ${path#"$PLUGIN_ROOT"/}"
      return 1
    }
  done
}

test_profile_access_uses_canonical_host_api() {
  grep -q 'personProfile.get' "$SOURCE" || {
    echo "Salesforce extension does not use the canonical person profile API"
    return 1
  }
  ! grep -R -Eq 'setLoadProfile|getLoadProfile|pi\.pi\.loadProfile|person-profile\.json' "$PLUGIN_ROOT/src" || {
    echo "Salesforce source contains a legacy or direct profile-store path"
    return 1
  }
}
