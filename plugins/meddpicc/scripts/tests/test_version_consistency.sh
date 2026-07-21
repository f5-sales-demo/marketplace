#!/usr/bin/env bash
# All three manifests must declare the same version.

test_versions_match() {
	local pkg plugin mkt
	pkg=$(jq -r '.version' "$PLUGIN_ROOT/package.json")
	plugin=$(jq -r '.version' "$PLUGIN_ROOT/.xcsh-plugin/plugin.json")
	mkt=$(jq -r '.plugins[] | select(.name=="meddpicc") | .version' "$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json")
	if [ "$pkg" != "$plugin" ] || [ "$pkg" != "$mkt" ]; then
		echo "version mismatch: package.json=$pkg plugin.json=$plugin marketplace=$mkt"
		return 1
	fi
}
