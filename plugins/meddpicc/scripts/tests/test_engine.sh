#!/usr/bin/env bash
# End-to-end acceptance for the MEDDPICC engine CLI.

# Skipping when bun is absent keeps the suite usable on a bare machine, but in CI a skip
# would be a green gate that ran nothing. REQUIRE_BUN makes the absence a failure instead.
_engine_precheck() {
  command -v bun >/dev/null 2>&1 && return 0
  # Aborts the whole run rather than returning: a missing runtime is a configuration error,
  # and every one of these tests would otherwise report a green skip having run nothing.
  if [ "${REQUIRE_BUN:-0}" = "1" ]; then
    echo "FATAL: bun is required (REQUIRE_BUN=1) but is not installed" >&2
    exit 1
  fi
  echo "SKIP: bun unavailable"
  return 1
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
  # Corrupt the first mapped jsonPath.
  jq '.cells[0].jsonPath = (.cells[0].jsonPath + "TYPO")' "$tmp/cell.json" >"$tmp/cell-broken.json"
  if bun "$PLUGIN_ROOT/engine/cli.ts" check-mappings --cell "$tmp/cell-broken.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for broken mapping"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}

test_engine_fill_plan_targets_the_template() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" fill "$PLUGIN_ROOT/schema/example-deal.json" --plan)
  [ "$(jq -r '.sheetName' <<<"$out")" = "MEDDPICC Deal Review Sheet" ] || {
    echo "fill --plan targets the wrong sheet: $out"
    return 1
  }
  # Every address must be a real A1 reference; a malformed one would throw at write time.
  local bad
  bad=$(jq -r '[.cells[].address | select(test("^[A-Z]+[0-9]+$") | not)] | join(",")' <<<"$out")
  [ -z "$bad" ] || {
    echo "malformed cell addresses: $bad"
    return 1
  }
  # I7 is the template's own formula and must never be a target.
  jq -e '[.cells[].address] | index("I7") | not' <<<"$out" >/dev/null || {
    echo "fill would overwrite the I7 formula"
    return 1
  }
}

test_engine_fill_writes_a_workbook_that_keeps_the_template() {
  _engine_precheck || return 0
  command -v unzip >/dev/null 2>&1 || {
    echo "SKIP: unzip unavailable"
    return 0
  }
  local tmp
  tmp=$(mktemp -d)
  bun "$PLUGIN_ROOT/engine/cli.ts" fill "$PLUGIN_ROOT/schema/example-deal.json" --out "$tmp/out.xlsx" >/dev/null || {
    echo "fill --out failed"
    rm -rf "$tmp"
    return 1
  }
  # The workbook must still carry both sheets and its data validation.
  unzip -p "$tmp/out.xlsx" xl/workbook.xml | grep -q "Pick List" || {
    echo "the Pick List sheet did not survive the fill"
    rm -rf "$tmp"
    return 1
  }
  local dv
  dv=$(unzip -p "$tmp/out.xlsx" xl/worksheets/sheet1.xml | grep -c "x14:dataValidation " || true)
  [ "$dv" -ge 1 ] || {
    echo "data validation was stripped by the fill"
    rm -rf "$tmp"
    return 1
  }
  rm -rf "$tmp"
}

test_engine_fill_is_deterministic() {
  _engine_precheck || return 0
  local a b
  a=$(bun "$PLUGIN_ROOT/engine/cli.ts" fill "$PLUGIN_ROOT/schema/example-deal.json" --plan)
  b=$(bun "$PLUGIN_ROOT/engine/cli.ts" fill "$PLUGIN_ROOT/schema/example-deal.json" --plan)
  [ "$a" = "$b" ] || {
    echo "fill --plan is not deterministic"
    return 1
  }
}

test_engine_check_spec_ok() {
  _engine_precheck || return 0
  bun "$PLUGIN_ROOT/engine/cli.ts" check-spec >/dev/null || {
    echo "check-spec failed on the shipped workbook spec"
    return 1
  }
}

test_engine_check_spec_detects_a_dropped_element() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  # Pin the wildcard to seven of the eight elements. The workbook still looks complete and
  # every path still resolves; the deal is just quietly scored out of 28.
  jq '(.sheets[] | select(.name == "Qualification") | .tables[0].source) =
        {"kind": "fixed", "keys": ["metrics","economicBuyer","decisionCriteria","decisionProcess","paperProcess","implicateThePain","competition"]}' \
    "$PLUGIN_ROOT/engine/workbook-spec.json" >"$tmp/spec.json"
  if bun "$PLUGIN_ROOT/engine/cli.ts" check-spec --spec "$tmp/spec.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for a spec missing an element score"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}

test_engine_check_spec_detects_a_broken_formula_reference() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  # Rename a column the Scorecard's formulas point at. Nothing else changes.
  jq '(.sheets[] | select(.name == "Qualification") | .tables[0].columns[] | select(.id == "score") | .id) = "renamed"' \
    "$PLUGIN_ROOT/engine/workbook-spec.json" >"$tmp/spec.json"
  if bun "$PLUGIN_ROOT/engine/cli.ts" check-spec --spec "$tmp/spec.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for a formula naming a column that no longer exists"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}

test_engine_generate_plan_maps_every_input() {
  _engine_precheck || return 0
  local out
  out=$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PLUGIN_ROOT/schema/example-deal.json" --plan)
  [ "$(jq -r '.sheets | length' <<<"$out")" = "8" ] || {
    echo "expected 8 sheets: $(jq -c '.sheets' <<<"$out")"
    return 1
  }
  # Every input cell must name a real address; a malformed one would throw at write time.
  local bad
  bad=$(jq -r '[.inputCells[].address | select(test("^[A-Z]+[0-9]+$") | not)] | join(",")' <<<"$out")
  [ -z "$bad" ] || {
    echo "malformed addresses: $bad"
    return 1
  }
  # The Scorecard is entirely computed, so nothing on it may be reported as an input.
  [ "$(jq -r '[.inputCells[] | select(.sheet == "Scorecard")] | length' <<<"$out")" = "0" ] || {
    echo "Scorecard reported as holding inputs"
    return 1
  }
}

test_engine_generate_writes_a_workbook() {
  _engine_precheck || return 0
  command -v unzip >/dev/null 2>&1 || {
    echo "SKIP: unzip unavailable"
    return 0
  }
  local tmp
  tmp=$(mktemp -d)
  bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PLUGIN_ROOT/schema/example-deal.json" --out "$tmp/out.xlsx" >/dev/null || {
    echo "generate --out failed"
    rm -rf "$tmp"
    return 1
  }
  # No placeholder may survive into a worksheet: Excel would show the literal braces.
  if unzip -p "$tmp/out.xlsx" 'xl/worksheets/sheet*.xml' | grep -q '{{'; then
    echo "an unresolved {{...}} placeholder reached the workbook"
    rm -rf "$tmp"
    return 1
  fi
  unzip -p "$tmp/out.xlsx" xl/workbook.xml | grep -q "Scorecard" || {
    echo "Scorecard sheet missing from the workbook"
    rm -rf "$tmp"
    return 1
  }
  rm -rf "$tmp"
}

test_engine_generate_is_deterministic() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PLUGIN_ROOT/schema/example-deal.json" --out "$tmp/a.xlsx" >/dev/null
  bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PLUGIN_ROOT/schema/example-deal.json" --out "$tmp/b.xlsx" >/dev/null
  cmp -s "$tmp/a.xlsx" "$tmp/b.xlsx" || {
    echo "generate is not byte-deterministic"
    rm -rf "$tmp"
    return 1
  }
  rm -rf "$tmp"
}

# Real Excel is the only thing that can tell us a formula computes what we meant. Opening it
# hijacks the operator's foreground app, so it runs on request rather than on every suite run.
test_engine_generate_excel_uat() {
  _engine_precheck || return 0
  if [ "${MEDDPICC_EXCEL_UAT:-0}" != "1" ]; then
    echo "SKIP: set MEDDPICC_EXCEL_UAT=1 to drive real Excel"
    return 0
  fi
  bash "$PLUGIN_ROOT/scripts/uat-generate-excel.sh" || {
    echo "Excel UAT failed"
    return 1
  }
}

test_engine_check_mappings_detects_a_target_aimed_at_a_label() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  # B4 is the words "Account Name". Aiming a value at it is schema-valid and wrong — this
  # is exactly the defect the mapping shipped with before the template was ever filled.
  jq '(.cells[] | select(.jsonPath == "metadata.accountName") | .cell) = "B4"' \
    "$PLUGIN_ROOT/skills/deal-qualification/references/cell-mapping.json" >"$tmp/cell-label.json"
  if bun "$PLUGIN_ROOT/engine/cli.ts" check-mappings --cell "$tmp/cell-label.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for a mapping aimed at a label cell"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
}
