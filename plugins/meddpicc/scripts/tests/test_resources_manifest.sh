#!/usr/bin/env bash
# Tests for .xcsh-plugin/resources.json

test_resources_manifest_paths_exist() {
  local manifest="$PLUGIN_ROOT/.xcsh-plugin/resources.json"
  if [ ! -f "$manifest" ]; then
    echo "resources.json missing"
    return 1
  fi
  local engine_entry
  engine_entry=$(jq -r '.engine.entry' "$manifest")
  [ -f "$PLUGIN_ROOT/$engine_entry" ] || {
    echo "engine.entry missing: $engine_entry"
    return 1
  }
  # Every top-level string value is a declared resource path — `xcsh://plugin/<name>/<key>`
  # resolves exactly those, so each one must exist on disk.
  local key p
  while IFS=$'\t' read -r key p; do
    [ -f "$PLUGIN_ROOT/$p" ] || {
      echo "resource \"$key\" points at a missing file: $p"
      return 1
    }
  done < <(jq -r 'to_entries[] | select(.value | type == "string") | [.key, .value] | @tsv' "$manifest")
}

# The pane surfaces the schema and the template through `xcsh://plugin/meddpicc/<key>`,
# which only resolves TOP-LEVEL string keys. Nesting a path (the old `mappings.cell`)
# made it unreachable, so pin the shape the resolver actually supports.
test_resources_manifest_declares_reachable_keys() {
  local manifest="$PLUGIN_ROOT/.xcsh-plugin/resources.json"
  local key
  for key in schema example template cellMapping sfdcMapping; do
    [ "$(jq -r --arg k "$key" '.[$k] | type' "$manifest")" = "string" ] || {
      echo "resources.json must declare \"$key\" as a top-level string"
      return 1
    }
  done
}

# `fill` is what both surfaces call to produce the report; a manifest that does
# not advertise it leaves the pane guessing at the engine's surface.
test_resources_manifest_advertises_engine_commands() {
  local manifest="$PLUGIN_ROOT/.xcsh-plugin/resources.json"
  local cmd
  for cmd in validate next score hint fill check-mappings; do
    jq -e --arg c "$cmd" '.engine.commands | index($c)' "$manifest" >/dev/null || {
      echo "engine.commands does not advertise \"$cmd\""
      return 1
    }
  done
}
