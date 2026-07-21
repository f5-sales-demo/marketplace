#!/usr/bin/env bash
# Tests for .xcsh-plugin/resources.json

test_resources_manifest_paths_exist() {
	local manifest="$PLUGIN_ROOT/.xcsh-plugin/resources.json"
	if [ ! -f "$manifest" ]; then echo "resources.json missing"; return 1; fi
	local schema engine_entry
	schema=$(jq -r '.schema' "$manifest")
	engine_entry=$(jq -r '.engine.entry' "$manifest")
	[ -f "$PLUGIN_ROOT/$schema" ] || { echo "schema path missing: $schema"; return 1; }
	[ -f "$PLUGIN_ROOT/$engine_entry" ] || { echo "engine.entry missing: $engine_entry"; return 1; }
	# every mappings.* path resolves
	local p
	for p in $(jq -r '.mappings // {} | to_entries[] | .value' "$manifest"); do
		[ -f "$PLUGIN_ROOT/$p" ] || { echo "mapping path missing: $p"; return 1; }
	done
}
