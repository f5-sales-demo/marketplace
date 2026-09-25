#!/usr/bin/env bash

test_kvm_plugin_manifest() {
  jq -e '
    .name == "kvm" and
    .version == "3.0.3" and
    .version == (input | .version) and
    .lifecycle.setupRequired == true and
    .lifecycle.setupAuthorization == "install" and
    .lifecycle.pluginDependencies == ["platform"]
  ' "$PLUGIN_ROOT/.xcsh-plugin/plugin.json" "$PLUGIN_ROOT/package.json" >/dev/null
}

test_kvm_marketplace_entry() {
  local marketplace_manifest="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  if [ -f "$marketplace_manifest" ]; then
    jq -e '[.plugins[] | select(.name == "kvm" and .version == "3.0.3" and .source == "./plugins/kvm" and .recommended == true and .lifecycle.setupAuthorization == "install")] | length == 1' "$marketplace_manifest" >/dev/null
  else
    jq -e '.name == "kvm" and .version == "3.0.3"' "$PLUGIN_ROOT/.xcsh-plugin/plugin.json" >/dev/null
  fi
}

test_kvm_required_surfaces() {
  local path
  for path in package.json bun.lock tsconfig.json artifacts.json README.md NETWORKING.md knowledge/ledger.json \
    src/index.ts src/tools.ts scripts/kvm-smsv2ctl scripts/kvm_smsv2_controller.py scripts/bridge-prep.py \
    terraform/versions.tf terraform/main.tf terraform/variables.tf terraform/outputs.tf \
    terraform/.terraform.lock.hcl terraform/registry.tfrc terraform/ensure-image.sh terraform/wait-registration.py \
    skills/kvm-smsv2/SKILL.md; do
    [ -f "$PLUGIN_ROOT/$path" ] || {
      echo "missing: $path"
      return 1
    }
  done
}

test_kvm_clean_break() {
  if rg -n -i '\b(appstack|voltstack|maurice_config|get-image-download-url|enable_aws|enable_azure)\b' \
    "$PLUGIN_ROOT/src" "$PLUGIN_ROOT/terraform" "$PLUGIN_ROOT/skills"; then
    return 1
  fi
  if rg -n 'kvm_smsv2_(preflight|plan|apply|drift)' "$PLUGIN_ROOT/src" "$PLUGIN_ROOT/skills"; then
    return 1
  fi
  if rg -n 'httpbin\.org' "$PLUGIN_ROOT/terraform/main.tf" "$PLUGIN_ROOT/scripts/kvm_smsv2_controller.py"; then
    return 1
  fi
}

test_kvm_artifact_manifest() {
  python3 - "$PLUGIN_ROOT" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "artifacts.json").read_text())
for relative, expected in manifest["artifacts"].items():
    assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, relative
PY
}

test_kvm_knowledge_readme_is_current() {
  diff -u "$PLUGIN_ROOT/README.md" <(python3 "$PLUGIN_ROOT/scripts/generate-knowledge-readme.py" --stdout)
}

test_kvm_installed_cache_executes() {
  (
    set -e
    installed=$(mktemp -d)
    state=$(mktemp -d)
    trap 'rm -rf "$installed" "$state"' EXIT
    mkdir -p "$installed/kvm"
    cp -R \
      "$PLUGIN_ROOT/.xcsh-plugin" \
      "$PLUGIN_ROOT/knowledge" \
      "$PLUGIN_ROOT/scripts" \
      "$PLUGIN_ROOT/skills" \
      "$PLUGIN_ROOT/src" \
      "$PLUGIN_ROOT/terraform" \
      "$PLUGIN_ROOT/test" \
      "$installed/kvm/"
    cp \
      "$PLUGIN_ROOT/artifacts.json" \
      "$PLUGIN_ROOT/bun.lock" \
      "$PLUGIN_ROOT/package.json" \
      "$PLUGIN_ROOT/README.md" \
      "$PLUGIN_ROOT/NETWORKING.md" \
      "$PLUGIN_ROOT/tsconfig.json" \
      "$installed/kvm/"
    output=$(cd / && KVM_SMSV2_STATE_DIR="$state" "$installed/kvm/scripts/kvm-smsv2ctl" --json readiness)
    jq -e '.schemaVersion == "kvm.smsv2/v3" and .controllerVersion == "3.0.2" and .action == "readiness" and .ok == true and .result.checks.artifacts == true' \
      <<<"$output" >/dev/null || exit 1
    (cd / && python3 "$installed/kvm/scripts/tests/test_controller_v2.py") || exit 1
    (cd / && python3 "$installed/kvm/scripts/tests/test_home_lan.py") || exit 1
    (cd / && bun test "$installed/kvm/test/knowledge.test.ts" "$installed/kvm/test/v2-contract.test.ts") || exit 1
  )
}
