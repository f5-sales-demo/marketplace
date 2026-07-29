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

test_engine_check_sfdc_ok() {
  _engine_precheck || return 0
  bun "$PLUGIN_ROOT/engine/cli.ts" check-sfdc >/dev/null || {
    echo "check-sfdc failed on the shipped Salesforce field mapping"
    return 1
  }
}

test_engine_check_sfdc_detects_a_broken_path() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  # A schemaPath that resolves nowhere maps a Salesforce field to nothing, silently.
  jq '.fieldMappings[0].schemaPath = (.fieldMappings[0].schemaPath + "TYPO")' \
    "$PLUGIN_ROOT/skills/deal-qualification/references/sfdc-field-mapping.json" >"$tmp/sfdc-broken.json"
  if bun "$PLUGIN_ROOT/engine/cli.ts" check-sfdc --sfdc "$tmp/sfdc-broken.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for a schemaPath that resolves nowhere"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$tmp"
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

test_engine_migrate_refuses_and_then_fixes_a_legacy_deal() {
  _engine_precheck || return 0
  local tmp
  tmp=$(mktemp -d)
  # A deal using the retired field names. The schema tolerates them silently, so the engine has to
  # refuse rather than read a workbook full of blanks where the answers used to be.
  jq '
    .metadata.revenue.pAndIplusAcvx = .metadata.revenue.subscription
    | del(.metadata.revenue.subscription)
    | .threeWhys.f5 = .threeWhys.us | del(.threeWhys.us)
    | .threeWhys.f5.whyF5 = .threeWhys.f5.whyUs | del(.threeWhys.f5.whyUs)
    | .team.f5 = .team.internal | del(.team.internal)
  ' "$PLUGIN_ROOT/schema/example-deal.json" >"$tmp/legacy.json" || {
    echo "could not build the legacy fixture"
    rm -rf "$tmp"
    return 1
  }

  if bun "$PLUGIN_ROOT/engine/cli.ts" validate "$tmp/legacy.json" >/dev/null 2>&1; then
    echo "expected non-zero exit for a deal using retired field names"
    rm -rf "$tmp"
    return 1
  fi

  # A dry run must change nothing on disk.
  bun "$PLUGIN_ROOT/engine/cli.ts" migrate "$tmp/legacy.json" >/dev/null 2>&1
  if ! grep -q "whyF5" "$tmp/legacy.json"; then
    echo "migrate without --apply rewrote the file"
    rm -rf "$tmp"
    return 1
  fi

  bun "$PLUGIN_ROOT/engine/cli.ts" migrate "$tmp/legacy.json" --apply >/dev/null || {
    echo "migrate --apply exited non-zero"
    rm -rf "$tmp"
    return 1
  }
  bun "$PLUGIN_ROOT/engine/cli.ts" validate "$tmp/legacy.json" >/dev/null || {
    echo "the migrated deal does not validate"
    rm -rf "$tmp"
    return 1
  }
  rm -rf "$tmp"
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
  jq '(.sheets[].blocks[] | select(.kind == "table" and .table.id == "elements") | .table.source) =
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
  # Rename a column the scorecard's formulas point at. Nothing else changes.
  jq '(.sheets[].blocks[] | select(.kind == "table" and .table.id == "elements") | .table.columns[] | select(.id == "score") | .id) = "renamed"' \
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
  # One laid-out sheet, the way the manual deal-review sheet is one page.
  local sheet
  sheet=$(jq -r '.sheets[0].name' "$PLUGIN_ROOT/engine/workbook-spec.json")
  [ "$(jq -r '.sheets | length' <<<"$out")" = "1" ] || {
    echo "expected one sheet: $(jq -c '[.sheets[].name]' <<<"$out")"
    return 1
  }
  # Every input cell must name a real address; a malformed one would throw at write time.
  local bad
  bad=$(jq -r '[.inputCells[].address | select(test("^[A-Z]+[0-9]+$") | not)] | join(",")' <<<"$out")
  [ -z "$bad" ] || {
    echo "malformed addresses: $bad"
    return 1
  }
  # Every input belongs to that sheet: an input naming a sheet the workbook does not have would
  # be read back against nothing.
  [ "$(jq -r --arg sheet "$sheet" '[.inputCells[] | select(.sheet != $sheet)] | length' <<<"$out")" = "0" ] || {
    echo "input cells name a sheet that is not $sheet: $(jq -c '[.inputCells[].sheet] | unique' <<<"$out")"
    return 1
  }
  # Every table the spec declares is placed, so nothing was silently skipped.
  local declared placed
  declared=$(jq -r '[.sheets[].blocks[] | select(.kind == "table") | .table.id] | sort | join(",")' \
    "$PLUGIN_ROOT/engine/workbook-spec.json")
  placed=$(jq -r '[.tables[].id] | sort | join(",")' <<<"$out")
  [ "$declared" = "$placed" ] || {
    echo "tables declared [$declared] but placed [$placed]"
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
  local sheet
  sheet=$(jq -r '.sheets[0].name' "$PLUGIN_ROOT/engine/workbook-spec.json")
  unzip -p "$tmp/out.xlsx" xl/workbook.xml | grep -qF "$sheet" || {
    echo "the $sheet sheet is missing from the workbook"
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
