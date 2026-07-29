#!/usr/bin/env bash
# All four version files must declare the same version.

test_versions_match() {
  local pkg plugin mkt engine
  pkg=$(jq -r '.version' "$PLUGIN_ROOT/package.json")
  plugin=$(jq -r '.version' "$PLUGIN_ROOT/.xcsh-plugin/plugin.json")
  mkt=$(jq -r '.plugins[] | select(.name=="meddpicc") | .version' "$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json")
  # engine/package.json carries a version too and was not compared, so it could drift unnoticed.
  engine=$(jq -r '.version' "$PLUGIN_ROOT/engine/package.json")
  if [ "$pkg" != "$plugin" ] || [ "$pkg" != "$mkt" ] || [ "$pkg" != "$engine" ]; then
    echo "version mismatch: package.json=$pkg plugin.json=$plugin marketplace=$mkt engine=$engine"
    return 1
  fi
}
