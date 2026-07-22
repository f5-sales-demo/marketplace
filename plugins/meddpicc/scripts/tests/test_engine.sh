#!/usr/bin/env bash
# End-to-end acceptance for the MEDDPICC engine CLI.

_engine_precheck() {
  command -v bun >/dev/null 2>&1 || {
    echo "SKIP: bun unavailable"
    return 1
  }
}

test_engine_score_matches_example() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" score "$PLUGIN_ROOT/schema/example-deal.json")
  [ "$(jq -r '.sum' <<<"$out")" = "21" ] || {
    echo "sum != 21: $out"
    return 1
  }
  [ "$(jq -r '.overallScore' <<<"$out")" = "65.6" ] || {
    echo "overallScore != 65.6"
    return 1
  }
  [ "$(jq -r '.overallRating' <<<"$out")" = "Yellow" ] || {
    echo "rating != Yellow"
    return 1
  }
}

test_engine_validate_ok() {
  _engine_precheck || return 0
  bun "$PLUGIN_ROOT/engine/cli.ts" validate "$PLUGIN_ROOT/schema/example-deal.json" >/dev/null || {
    echo "validate failed"
    return 1
  }
}

test_engine_next_resume() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" next "$PLUGIN_ROOT/schema/example-deal.json")
  [ "$(jq -r '.nextIncompleteSection' <<<"$out")" = "decisionProcess" ] || {
    echo "next != decisionProcess: $out"
    return 1
  }
}

test_engine_check_mappings_ok() {
  _engine_precheck || return 0
  bun "$PLUGIN_ROOT/engine/cli.ts" check-mappings >/dev/null || {
    echo "check-mappings failed on shipped files"
    return 1
  }
}

test_engine_hint_overview() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" hint)
  [ "$(jq -r '.elements | length' <<<"$out")" = "8" ] || {
    echo "hint overview != 8 elements: $out"
    return 1
  }
}

test_engine_hint_element() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" hint metrics)
  [ "$(jq -r '.scoreDefinition."4"' <<<"$out")" != "null" ] || {
    echo "metrics rubric missing"
    return 1
  }
}

test_engine_next_has_hint() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" next "$PLUGIN_ROOT/schema/example-deal.json")
  [ "$(jq -r '.hint.element' <<<"$out")" = "decisionProcess" ] || {
    echo "next hint != decisionProcess: $out"
    return 1
  }
}

test_engine_check_mappings_detects_broken() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  cp "$PLUGIN_ROOT/skills/deal-qualification/references/cell-mapping.json" "$tmp/cell.json"
  # Corrupt the first staticFields jsonPath.
  jq '.staticFields[0].jsonPath = (.staticFields[0].jsonPath + "TYPO")' "$tmp/cell.json" >"$tmp/cell-broken.json"
  if bun "$PLUGIN_ROOT/engine/cli.ts" check-mappings --cell "$tmp/cell-broken.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for broken mapping"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}
