#!/usr/bin/env bash
# uat-generate-excel.sh — open a generated workbook in real Excel and check it computed.
#
# The unit tests assert what we WRITE. They cannot assert what Excel makes of it, and that
# is the part with the interesting failure modes: a malformed part makes Excel offer to
# repair rather than open, a date written as text turns arithmetic into #VALUE!, and a
# formula referring to the wrong range is perfectly well-formed and silently wrong.
#
# So this drives the real application: generate, open, read the scorecard back, and compare
# it against what `engine score` computes from the same deal by a completely different route.
# Agreement between the two is the evidence; either alone proves much less.
#
# macOS with Excel only. Skips, loudly, anywhere else.
set -uo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PLUGIN_ROOT="$(cd -- "$HERE/.." && pwd -P)"
DEAL="${1:-$PLUGIN_ROOT/schema/example-deal.json}"
UAT_LOCALE="${MEDDPICC_UAT_LOCALE:-en}"
LOCALE_ARGS=(--locale "$UAT_LOCALE")
LOCALE_FILE="$PLUGIN_ROOT/engine/locales/$UAT_LOCALE.json"
WORK="$(mktemp -d)"
OUT="$WORK/uat-deal.xlsx"
BOOK="$(basename "$OUT")"
skip() {
  echo "SKIP: $1"
  exit 0
}

command -v bun >/dev/null 2>&1 || skip "bun unavailable"
command -v jq >/dev/null 2>&1 || skip "jq unavailable"
command -v osascript >/dev/null 2>&1 || skip "not macOS (no osascript)"
[ -d "/Applications/Microsoft Excel.app" ] || skip "Microsoft Excel is not installed"

# The content columns: from the one past the gutter to the last one the spec sizes. Both come from
# the spec, so widening the grid moves every assertion built on them.
content_start="$(jq -r '.sheets[0].columns[0].max + 1' "$PLUGIN_ROOT/engine/workbook-spec.json")"
content_end="$(jq -r '[.sheets[0].columns[].max] | max' "$PLUGIN_ROOT/engine/workbook-spec.json")"

# 1-based column number to Excel letters: 1 -> A, 27 -> AA.
letters() {
  awk -v n="$1" 'BEGIN {
    out = ""
    while (n > 0) { r = (n - 1) % 26; out = sprintf("%c", 65 + r) out; n = int((n - 1) / 26) }
    print out
  }'
}

# Every workbook this script can open, by the name Excel knows it as. Closing is BY NAME and never
# "every workbook": the operator has their own spreadsheets open, `saving no` discards unsaved
# changes, and a test has no business touching a document it did not create. These four names are
# ours — they are basenames of files under this run's temp directory — so a stale one left by an
# earlier failed run is safe to close, which is the point.
OUR_WORKBOOKS=(uat-deal.xlsx rt.xlsx grown.xlsx uat-partial.xlsx)

close_our_workbooks() {
  local book
  for book in "${OUR_WORKBOOKS[@]}"; do
    osascript >/dev/null 2>&1 <<OSA
tell application "Microsoft Excel"
  set display alerts to false
  try
    close workbook "$book" saving no
  end try
  set display alerts to true
end tell
OSA
  done
}

# A failure part-way through used to leave a LATER workbook open — the handler closed only the first
# one — and the next run then read the scorecard out of the stale copy and reported an empty rating,
# blaming the code under test for Excel's state.
fail() {
  echo "FAIL: $1" >&2
  close_our_workbooks
  exit 1
}

# A completion cell contains the words a person sees, while the engine reports the canonical JSON
# token. Those are deliberately different things: today "Not started" means `not_started`, and a
# translated workbook will show neither spelling. Ask the engine's reverse map rather than encoding an
# English-only labelling rule in the acceptance test.
canonical_enum_value() {
  local displayed="$1"
  (
    cd "$PLUGIN_ROOT" || exit 2
    bun -e '
      import * as fs from "node:fs";
      import { canonicalEnumValue } from "./engine/labels.ts";
      import { loadLocale, resolveLocale } from "./engine/locale.ts";
      const displayed = process.argv[1] ?? "";
      const requested = process.argv[2] ?? "en";
      const spec = JSON.parse(fs.readFileSync("./engine/workbook-spec.json", "utf8"));
      const schema = JSON.parse(fs.readFileSync("./schema/meddpicc-schema.json", "utf8"));
      const context = loadLocale(resolveLocale({ flag: requested, env: {} }), spec, schema);
      const canonical = canonicalEnumValue(displayed, ["not_started", "partial", "complete"], context);
      if (canonical === undefined) {
        process.stderr.write(`No canonical enum value for ${JSON.stringify(displayed)}\n`);
        process.exit(1);
      }
      process.stdout.write(canonical);
    ' -- "$displayed" "$UAT_LOCALE"
  )
}

# Expected text comes from the locale catalogue, independently of the generator path being exercised.
translate_source() {
  local source="$1" translated
  if [ "$UAT_LOCALE" = "en" ]; then
    printf '%s' "$source"
    return 0
  fi
  [ -f "$LOCALE_FILE" ] || fail "locale catalogue not found: $LOCALE_FILE"
  translated="$(jq -er --arg source "$source" '.translations[$source]' "$LOCALE_FILE")" ||
    fail "the $UAT_LOCALE catalogue has no translation for '$source'"
  printf '%s' "$translated"
}

localized_list() {
  local value out="" separator=""
  while IFS= read -r value; do
    [ -n "$value" ] || continue
    out+="$separator$(translate_source "$value")"
    separator=,
  done
  printf '%s' "$out"
}

# Start from a clean slate for the same reason, still only among our own names.
close_our_workbooks

# The workbook is ONE laid-out sheet, and its tab name is localized. Every address and the tab itself
# come from the same plan rather than from English source text repeated in this script.
uat_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$DEAL" --plan "${LOCALE_ARGS[@]}")" ||
  fail "generate --plan failed for locale $UAT_LOCALE"
SHEET="$(jq -r '.sheets[0].name // "MISSING"' <<<"$uat_plan")"
[ "$SHEET" != "MISSING" ] || fail "the localized plan has no sheet"

# Appearing in `get name of every workbook` means Excel has ACCEPTED the file, not that it has
# finished with it. Writing too early fails silently, and the symptom is a later assertion reporting
# a value that was never written — which is how this script twice blamed the code under test for
# Excel still being busy. So wait until a known cell reads back, then verify every write.
wait_until_ready() {
  local book="$1" sheet="$2" cell="$3" seen
  for _ in $(seq 1 30); do
    seen="$(
      osascript 2>/dev/null <<OSA
tell application "Microsoft Excel"
  return (get value of cell "$cell" of worksheet "$sheet" of workbook "$book") as string
end tell
OSA
    )"
    [ -n "${seen// /}" ] && return 0
    sleep 1
  done
  return 1
}

# Run an AppleScript body that must end by returning "ok". Anything else — including an error
# AppleScript would otherwise print to stderr and lose — fails the run with the text.
excel_do() {
  local label="$1" body="$2" result
  result="$(
    osascript 2>&1 <<OSA
tell application "Microsoft Excel"
  set display alerts to false
$body
  set display alerts to true
  return "ok"
end tell
OSA
  )"
  [ "$result" = "ok" ] || fail "$label did not apply: ${result:-<no output>}"
}

echo "==> generating $OUT in $UAT_LOCALE"
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$DEAL" --out "$OUT" "${LOCALE_ARGS[@]}" >/dev/null ||
  fail "generate exited non-zero"

# What the engine says, by its own arithmetic.
score_json="$(bun "$PLUGIN_ROOT/engine/cli.ts" score "$DEAL")" || fail "score exited non-zero"
want_sum="$(jq -r '.sum' <<<"$score_json")"
want_rating="$(jq -r '.overallRating' <<<"$score_json")"
want_pct="$(jq -r '.overallScore' <<<"$score_json")"

echo "==> opening in Excel"
open -a "Microsoft Excel" "$OUT" || fail "could not open Excel"

# A repair prompt leaves the workbook absent from the application's list, so its presence is
# the "opened cleanly" assertion — there is no separate dialog to interrogate.
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$BOOK"; then
    opened=1
    break
  fi
  sleep 2
done
[ "${opened:-0}" = "1" ] || fail "Excel never listed $BOOK — it most likely offered to repair the file"
echo "    opened with no repair prompt"

# The scorecard cells by NAME, from the plan. Scanning for a label was how this used to find them,
# and it cannot survive translation: a Korean workbook has no cell reading "Total score", while
# `scoreTotal` is the same id in every language.
named() {
  local ref
  ref="$(jq -r --arg id "$1" '.namedCells[$id] // "MISSING"' <<<"$uat_plan")"
  [ "$ref" != "MISSING" ] || fail "the plan has no named cell \"$1\""
  # `Sheet!Address` — this script asks for the sheet separately, so hand back the address.
  echo "${ref##*!}"
}

read_named() {
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  return (get value of cell "$(named "$1")" of worksheet "$SHEET" of workbook "$BOOK") as string
end tell
OSA
}

got_sum="$(read_named scoreTotal)"
got_rating="$(read_named scoreRating)"
got_pct_raw="$(read_named scorePercent)"

echo "    Total score: Excel=$got_sum engine=$want_sum"
[ "${got_sum%.*}" = "$want_sum" ] || fail "Excel computed $got_sum, engine says $want_sum"

echo "    Rating: Excel=$got_rating engine=$want_rating"
[ "$got_rating" = "$want_rating" ] || fail "Excel rated $got_rating, engine says $want_rating"

# Excel holds the fraction; the engine reports a percentage to one decimal.
got_pct="$(awk -v v="$got_pct_raw" 'BEGIN { printf "%.1f", v * 100 }')"
echo "    Overall score: Excel=$got_pct% engine=$want_pct%"
[ "$got_pct" = "$want_pct" ] || fail "Excel computed $got_pct%, engine says $want_pct%"

# Three cells agreeing with the engine is not the same as the scorecard being right. Every count
# below is derivable from the deal JSON by a completely different route, so ask Excel for each one
# and compare.
#
# This stage exists because its absence hid a real defect for a whole session: booleans are written
# as the word "Yes", and the counts still compared against a logical TRUE. Excel does not treat text
# "Yes" as TRUE, so Must Say Yes, Can Say No and Assigned all reported 0 where the deal has 2, 3 and
# 2 — well-formed, silently wrong, and invisible to every assertion there was.
check_count() {
  local id="$1" want="$2" got
  got="$(read_named "$id")"
  echo "    $id: Excel=${got:-<none>} deal=$want"
  # A zero expectation would let a formula that counts nothing agree with it, so refuse to compare.
  [ "$want" != "0" ] || fail "$id expects 0 from the deal — this comparison cannot fail, pick a fixture that exercises it"
  [ "${got%.*}" = "$want" ] || fail "Excel computed $id = $got, the deal says $want"
}

deal_count() { jq -r "$1" "$DEAL"; }
check_count mustSayYesCount "$(deal_count '[.stakeholders[] | select(.mustSayYes)] | length')"
check_count canSayNoCount "$(deal_count '[.stakeholders[] | select(.canSayNo)] | length')"
check_count teamInternalAssigned "$(deal_count '[.team.internal[] | select(.assignedToDeal)] | length')"
check_count stakeholdersMapped "$(deal_count '.stakeholders | length')"
check_count teamInternalCount "$(deal_count '.team.internal | length')"
check_count teamPartnerCount "$(deal_count '.team.partner | length')"
check_count milestonesTotal "$(deal_count '.closePlan.milestones | length')"
check_count questionsAnswered "$(deal_count '[.qualification[].responses // [] | .[] | select(. != "")] | length')"
# From `engine score`, not from jq: an unscored element counts as 0 and that rule belongs to the
# engine. Deriving it here again would be a second opinion that could disagree with both.
check_count elementsBelowThree "$(jq -r '[.elementScores[] | select(. < 3)] | length' <<<"$score_json")"
check_count scorePreviousTotal "$(deal_count '[.scoring.previousElementScores[]] | add')"
echo "PASS: every scorecard count Excel computes agrees with the deal JSON"

# ── Completion statuses ────────────────────────────────────────────────────────────────────────
#
# The thirteen section statuses used to be literals, computed when the workbook was written: fill in
# the missing evidence during a review and the sheet went on calling the section not started. They are
# the engine's own rules compiled into formulas now, and the whole risk of that is disagreement — a
# completion column that contradicts `engine next` is worse than one that is merely stale.
#
# So ask Excel for all thirteen and compare each against the engine's answer for the same deal. The
# comparison routes Excel's word through the engine's reverse map rather than repeating the label table
# here. That keeps working when a locale changes the words while still failing if they map to the wrong
# canonical status.
#
# `statuses_from_excel <book> <plan> <engine-json>` prints `section<TAB>normalised-status` per section.
#
# The cells are read in the engine's own section order and paired back up here: AppleScript does the
# one thing it is needed for. Splitting a "section:ref" string inside the tell block was the first
# attempt and it fails with -1723 — `offset of` belongs to StandardAdditions, so inside
# `tell application "Microsoft Excel"` it is sent to Excel, which has no such command.
statuses_from_excel() {
  local book="$1" plan="$2" engine="$3" section row first column refs=() sections=()
  # The block's geometry once, from the plan: nothing here counts rows for itself.
  column="$(letters "$(jq -r '(.tables[] | select(.id == "sections") | .columns.status)' <<<"$plan")")"
  first="$(jq -r '(.tables[] | select(.id == "sections") | .firstDataRow)' <<<"$plan")"
  [ -n "$column" ] && [ "$first" != "null" ] || fail "the plan has no sections table to read statuses from"
  row=0
  for section in $(jq -r '.order[]' <<<"$engine"); do
    sections+=("$section")
    refs+=("$column$((first + row))")
    row=$((row + 1))
  done

  local values canonical
  values="$(
    osascript - "$SHEET" "$book" "${refs[@]}" <<'OSA' 2>&1
on run argv
  set sheetName to item 1 of argv
  set bookName to item 2 of argv
  set out to ""
  tell application "Microsoft Excel"
    set ws to worksheet sheetName of workbook bookName
    repeat with i from 3 to (count of argv)
      set out to out & ((get value of range (item i of argv) of ws) as string) & linefeed
    end repeat
  end tell
  return out
end run
OSA
  )"
  case "$values" in
  *"execution error"* | *"syntax error"*) fail "could not read the completion statuses: $values" ;;
  esac

  # Excel's word -> the engine's value: lowercase, and a space is an underscore. Derived from the
  # labelling rule rather than a second copy of the label table, so renaming a status still fails here
  # while restyling one does not.
  local i=0 value
  while IFS= read -r value; do
    [ -n "$value" ] || continue
    canonical="$(canonical_enum_value "$value")" ||
      fail "Excel returned an unrecognised completion label for ${sections[$i]}: '$value'"
    printf '%s\t%s\n' "${sections[$i]}" "$canonical"
    i=$((i + 1))
  done <<<"$values"
}

compare_statuses() {
  local book="$1" deal="$2" plan="$3" label="$4" engine seen want got mismatches=0 compared=0
  engine="$(bun "$PLUGIN_ROOT/engine/cli.ts" next "$deal")" || fail "next failed for $deal"
  seen="$(statuses_from_excel "$book" "$plan" "$engine")"
  while IFS=$'\t' read -r section got; do
    [ -n "$section" ] || continue
    want="$(jq -r --arg s "$section" '.completionStatus[$s]' <<<"$engine")"
    compared=$((compared + 1))
    if [ "$got" != "$want" ]; then
      echo "    MISMATCH $section: Excel says '$got', the engine says '$want'"
      mismatches=$((mismatches + 1))
    fi
  done <<<"$seen"
  local tracked
  tracked="$(jq -r '.order | length' <<<"$engine")"
  [ "$compared" = "$tracked" ] || fail "compared $compared of $tracked sections in $label — the stage is not covering the block"
  [ "$mismatches" = "0" ] || fail "$mismatches completion status(es) in $label disagree with the engine"
  echo "    $compared section statuses in $label agree with the engine"
}

echo "==> comparing all thirteen completion statuses against the engine"
compare_statuses "$BOOK" "$DEAL" "$uat_plan" "the example deal"

echo "PASS: every completion status Excel computes agrees with the engine"

# A formula pointing at the wrong range is well-formed and wrong; an error value is at least
# loud. Check for the loud ones across every sheet.
# This check was vacuous for two independent reasons, either of which was enough (#904).
#
#   1. `repeat with ws in every worksheet of workbook "X"` raises "Parameter error. (-50)" when the
#      collection reference is iterated. osascript exited 1 with empty stdout, the stderr went to
#      /dev/null, and an empty result read as "no errors found". Enumerating by index works.
#   2. An error cell read through `value as string` yields "missing value", never "#DIV/0!", so the
#      comparison could not have matched even with a working loop. `string value` is the accessor
#      that surfaces the error text.
#
# So the detector now proves itself on every run instead of being trusted: clean, then with a
# deliberate =1/0, then clean again. An assertion nobody has watched fail is not an assertion.
error_values() {
  # Reports the ADDRESS of every error cell, not just the sheet. "MEDDPICC Deal Review:#DIV/0!" was
  # true and useless: it could not distinguish a formula that is wrong from the sentinel this stage
  # plants on purpose, and I spent three runs guessing which.
  osascript - "$BOOK" <<'OSA' 2>&1
on run argv
  set bookName to item 1 of argv
  tell application "Microsoft Excel"
    set errs to ""
    set n to count of worksheets of workbook bookName
    repeat with i from 1 to n
      set ws to worksheet i of workbook bookName
      set usedRange to (get used range of ws)
      set vals to (get string value of usedRange)
      set firstRow to (first row index of usedRange)
      set firstCol to (first column index of usedRange)
      set r to 0
      repeat with rw in vals
        set r to r + 1
        set c to 0
        repeat with v in rw
          set c to c + 1
          set sv to (v as string)
          if sv is in {"#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "#NULL!", "#NUM!"} then
            set cellRef to (get address of cell (r + firstRow - 1) of column (c + firstCol - 1) of ws)
            set errs to errs & (get name of ws) & "!" & cellRef & "=" & sv & " "
          end if
        end repeat
      end repeat
    end repeat
    return errs
  end tell
end run
OSA
}

# `fail` must not be called from inside a command substitution: it would exit only the subshell, and
# this script runs under `set -uo pipefail` with no `-e`, so the parent would carry on with an empty
# result — which reads as "no errors found". So `error_values` only ever returns text, and every
# decision about that text is taken in the parent shell.
assert_no_error_values() {
  local when="$1" errors
  errors="$(error_values)"
  case "$errors" in
  *"execution error"* | *"syntax error"*) fail "the error-value check could not run ($when): $errors" ;;
  esac
  [ -z "${errors// /}" ] || fail "Excel error values present ($when): $errors"
}

# The same check, but waiting for a change just made to take effect.
#
# Excel does not finish with a write before AppleScript asks the next question. Asserting straight
# after clearing the planted sentinel reported the #DIV/0! still present on one run in three — the code
# was right and the assertion was early, which is the worst kind of failing test because it points at
# the wrong thing. Only used where a mutation is known to be pending; the plain form above stays
# immediate, so a genuine error is not hidden behind a delay.
assert_error_values_clear() {
  local when="$1" errors i
  for i in $(seq 1 40); do
    errors="$(error_values)"
    case "$errors" in
    *"execution error"* | *"syntax error"*) fail "the error-value check could not run ($when): $errors" ;;
    esac
    [ -n "${errors// /}" ] || return 0
    sleep 0.25
  done
  fail "Excel error values still present after waiting ($when): $errors"
}

assert_no_error_values "before planting one"

# Now break it on purpose. A detector that has never fired is indistinguishable from one that cannot.
# Outside the content columns on purpose: planting the sentinel inside them would overwrite a real
# cell, and clearing it afterwards would not put the value back.
SENTINEL_CELL="$(letters "$((content_end + 4))")1"
excel_do "the deliberate error value" "  set formula of range \"$SENTINEL_CELL\" of worksheet \"$SHEET\" of workbook \"$BOOK\" to \"=1/0\""
planted="$(error_values)"
case "$planted" in
*"execution error"* | *"syntax error"*) fail "the error-value check could not run (planted): $planted" ;;
*"#DIV/0!"*) ;;
*) fail "the error-value detector did not notice a deliberate #DIV/0! in $SHEET!$SENTINEL_CELL: [${planted}]" ;;
esac
excel_do "clearing the deliberate error value" "  clear contents range \"$SENTINEL_CELL\" of worksheet \"$SHEET\" of workbook \"$BOOK\""
assert_error_values_clear "after clearing the planted one"
echo "    no Excel error values on any sheet (detector verified: it catches a planted #DIV/0!)"

echo "PASS: Excel opened the generated workbook and its scorecard agrees with the engine"

# Stage 2 added Excel Tables, conditional formatting and dropdowns. The file opening proves
# the XML is well-formed; it does not prove Excel made anything of it. Ask Excel directly.
#
# A heredoc, not `osascript -e`: the AppleScript needs its own double quotes around sheet and
# workbook names, and nesting those inside a shell string is how the first version of this
# silently produced empty answers that looked like missing features.
ask() {
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  return ($1) as string
end tell
OSA
}

# A cell of a table, by table id, column id and row offset, from the plan's own geometry. `at`
# below does the same for form fields; both exist so that no row number is written down in here.
table_column() {
  local col
  col="$(jq -r --arg t "$1" --arg c "$2" '(.tables[] | select(.id == $t) | .columns[$c]) // "MISSING"' <<<"$uat_plan")"
  [ "$col" != "MISSING" ] || fail "the plan has no column \"$2\" in table \"$1\""
  echo "$col"
}
table_row() {
  jq -r --arg t "$1" '(.tables[] | select(.id == $t) | .firstDataRow) // "MISSING"' <<<"$uat_plan"
}
table_cell() {
  local row
  row="$(table_row "$1")"
  [ "$row" != "MISSING" ] || fail "the plan has no table \"$1\""
  echo "$(letters "$(table_column "$1" "$2")")$((row + ${3:-0}))"
}
table_header_cell() {
  local header
  header="$(jq -r --arg t "$1" '(.tables[] | select(.id == $t) | .headerRow) // "MISSING"' <<<"$uat_plan")"
  [ "$header" != "MISSING" ] || fail "the plan has no table \"$1\""
  echo "$(letters "$(table_column "$1" "$2")")$header"
}

# NO Excel Tables, anywhere. This is the one-sheet layout's hard constraint rather than an
# oversight: Excel silently drops a table whose range contains a merged cell, and every span over
# one column on this sheet is a merge. A table appearing here would mean the generator had started
# writing `<tableParts>` again, and the drop would only show up as data quietly not extending.
tables_seen="$(ask "count of list objects of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
echo "    Excel sees ${tables_seen:-<none>} Excel Table(s) on $SHEET"
[ "$tables_seen" = "0" ] || fail "expected no Excel Tables on one laid-out sheet, Excel reports '$tables_seen'"

score_first="$(table_cell elements score 0)"
score_last="$(table_cell elements score 7)"
rules_seen="$(ask "count of format conditions of range \"$score_first:$score_last\" of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
echo "    Excel sees ${rules_seen:-<none>} conditional-format rule(s) on the score column ($score_first:$score_last)"
[ "$rules_seen" = "3" ] || fail "expected 3 conditional-format rules on the score column, Excel reports '$rules_seen'"

# The point of deriving dropdowns from the schema is that they cannot drift from it, so compare
# what Excel offers against what the schema says rather than against a literal repeated here.
want_roles="$(
  jq -r '.properties.stakeholders.items.properties.roleInDeal.enum[]' "$PLUGIN_ROOT/schema/meddpicc-schema.json" |
    localized_list
)"
role_cell="$(table_cell stakeholders roleInDeal 0)"
got_roles="$(ask "formula1 of (validation of range \"$role_cell\" of worksheet \"$SHEET\" of workbook \"$BOOK\")")"
echo "    role dropdown at $role_cell: Excel=[$got_roles] schema=[$want_roles]"
[ "$got_roles" = "$want_roles" ] || fail "the role dropdown does not match the schema enum"

got_scores="$(ask "formula1 of (validation of range \"$score_first\" of worksheet \"$SHEET\" of workbook \"$BOOK\")")"
echo "    score dropdown at $score_first: Excel=[$got_scores]"
[ "$got_scores" = "0,1,2,3,4" ] || fail "the score dropdown is '$got_scores', expected 0,1,2,3,4"

# A boolean cell holds the WORD "Yes", and the scorecard counts that word. Without a dropdown Excel
# accepts anything — and the reader is deliberately lenient, so TRUE typed into the cell is applied
# to the deal while the count beside it stays wrong until the workbook is regenerated. The dropdown
# is what stops the two from disagreeing, so ask Excel whether it really has one.
bool_cell="$(table_cell stakeholders mustSayYes 0)"
got_bool="$(ask "formula1 of (validation of range \"$bool_cell\" of worksheet \"$SHEET\" of workbook \"$BOOK\")")"
echo "    boolean dropdown at $bool_cell: Excel=[$got_bool]"
want_bool="$(printf '%s\n%s\n' Yes No | localized_list)"
[ "$got_bool" = "$want_bool" ] || fail "the boolean dropdown is '$got_bool', expected $want_bool"
echo "PASS: Excel recognises the conditional formats and the schema-derived dropdowns, and sees no Excel Table"

# ── The palette ────────────────────────────────────────────────────────────────────────────────
#
# Colour marks what needs attention, and nothing else: a finished element, a complete section and a
# rating of "Green" carry no fill at all. That is a rule about what is ABSENT, which is exactly what a
# unit test over our own XML is worst at proving — it can only check the rules we wrote, not what Excel
# resolved them to. So ask Excel for every rule on the cells that matter, including the colour it will
# actually paint, and check the shape of the ladder rather than a hex nobody can review.
#
# `condition operator` is missing on an expression rule and raises rather than returning empty, so it is
# read inside a try; a rule that has no operator is not a rule that failed.
cf_rules() {
  osascript - "$SHEET" "$BOOK" "$1" <<'OSA' 2>&1
on run argv
  tell application "Microsoft Excel"
    set ws to worksheet (item 1 of argv) of workbook (item 2 of argv)
    set r to range (item 3 of argv) of ws
    set out to ""
    repeat with i from 1 to (count of format conditions of r)
      set fc to format condition i of r
      set op to "none"
      try
        set op to (condition operator of fc) as string
      end try
      set c to color of interior object of fc
      set out to out & (format condition type of fc as string) & "|" & op & "|" & (formula 1 of fc) & "|" & ¬
        (item 1 of c) & "," & (item 2 of c) & "," & (item 3 of c) & linefeed
    end repeat
    return out
  end tell
end run
OSA
}

# Every wash has to be warm and faint: red at least green at least blue, and no channel far from white.
# This is the assertion that fails if green comes back anywhere — in a preset, in a dxf, or by somebody
# editing the file and saving it.
assert_warm_and_faint() {
  local where="$1" rgb="$2" r g b
  IFS=, read -r r g b <<<"$rgb"
  [ -n "$r" ] && [ -n "$g" ] && [ -n "$b" ] || fail "$where: Excel reported no colour for the rule ($rgb)"
  [ "$r" -ge "$g" ] && [ "$g" -ge "$b" ] || fail "$where: fill $rgb is not warm (needs red >= green >= blue)"
  [ "$b" -ge 208 ] || fail "$where: fill $rgb is not faint — it would read as an error state, not a wash"
}

score_rules="$(cf_rules "$score_first:$score_last")"
case "$score_rules" in
*"execution error"* | *"syntax error"*) fail "could not read the score column's rules: $score_rules" ;;
esac
score_rule_count="$(grep -c . <<<"$score_rules")"
echo "==> the score ladder, as Excel resolved it:"
sed 's/^/    /' <<<"$score_rules"
[ "$score_rule_count" = "3" ] || fail "expected 3 rules on the score column, Excel reports $score_rule_count"
score_index=0
while IFS='|' read -r _type _op formula rgb; do
  [ -n "$_type" ] || continue
  # 0 is nothing, 1 is barely, 2 is nearly — and the ladder stops there. A rule mentioning 3 or 4 would
  # be colouring a score that is done, which is the whole thing this palette removed.
  case "$formula" in
  *3* | *4*) fail "a score rule fires on '$formula'; 3 and 4 are done and carry no fill" ;;
  esac
  [ "$formula" = "=$score_index" ] || fail "score rule $((score_index + 1)) is '$formula', expected '=$score_index'"
  assert_warm_and_faint "score rule $formula" "$rgb"
  score_index=$((score_index + 1))
done <<<"$score_rules"

# A blank cell that a completion rule consults is washed; a blank cell nobody depends on is not.
evidence_cell="$(table_cell elements evidence 0)"
notes_cell="$(table_cell elements notes 0)"
evidence_rules="$(cf_rules "$evidence_cell")"
notes_rules="$(cf_rules "$notes_cell")"
echo "    evidence $evidence_cell: ${evidence_rules%$'\n'}"
echo "    notes $notes_cell: ${notes_rules:-<none>}"
[ "$(grep -c . <<<"$evidence_rules")" = "1" ] || fail "expected one wash on $evidence_cell, got: $evidence_rules"
case "$evidence_rules" in
*"expression|"*) : ;;
*) fail "the wash on $evidence_cell is not an expression rule: $evidence_rules" ;;
esac
case "$evidence_rules" in
*TRIM*) : ;;
*) fail "the wash on $evidence_cell does not test emptiness: $evidence_rules" ;;
esac
assert_warm_and_faint "the empty-cell wash" "$(cut -d'|' -f4 <<<"$evidence_rules" | head -1)"
[ -z "${notes_rules//[[:space:]]/}" ] || fail "the notes column is washed, and a blank note is a choice: $notes_rules"

# A list's spare rows are inside the wash's range, and the rule is what keeps them clear until somebody
# starts one. Both halves matter and they pull in opposite directions: a range stopping at the last
# entry leaves a half-typed stakeholder unwarned, and a rule without the row test washes every spare row
# of every new deal. So ask Excel for the range it holds and for the formula it will evaluate.
stake_name="$(table_cell stakeholders name 0)"
stake_rows="$(jq -r '(.tables[] | select(.id == "stakeholders") | .rows)' <<<"$uat_plan")"
stake_last="$(table_cell stakeholders name "$((stake_rows - 1))")"
stake_rules="$(cf_rules "$stake_name")"
stake_range="$(
  osascript - "$SHEET" "$BOOK" "$stake_name" <<'OSA' 2>&1
on run argv
  tell application "Microsoft Excel"
    set ws to worksheet (item 1 of argv) of workbook (item 2 of argv)
    return get address of (applies to of format condition 1 of range (item 3 of argv) of ws) without external
  end tell
end run
OSA
)"
echo "    stakeholder names: rule over $stake_range (capacity is $stake_rows rows, to $stake_last)"
case "$stake_rules" in
*COUNTA*) : ;;
*) fail "the stakeholder wash does not test whether the row has been started: $stake_rules" ;;
esac
# Excel writes the address absolute; compare on the row numbers, which is what this is about.
case "$stake_range" in
*"${stake_last#[A-Z]}") : ;;
*) fail "the stakeholder wash stops at $stake_range and the list has room to row ${stake_last#[A-Z]}" ;;
esac

# The rating word: "Red" and "Yellow" are painted, "Green" is not.
rating_rules="$(cf_rules "$(named scoreRating)")"
echo "    rating $(named scoreRating): ${rating_rules%$'\n'}"
[ "$(grep -c . <<<"$rating_rules")" = "2" ] || fail "expected 2 rules on the rating cell, got: $rating_rules"
case "$rating_rules" in
*Green*) fail "a rating rule fires on \"Green\" — good news carries no fill" ;;
esac
while IFS='|' read -r _t _o f rgb; do
  [ -n "$f" ] || continue
  assert_warm_and_faint "rating rule $f" "$rgb"
done <<<"$rating_rules"

# The two localized status vocabularies must move with their dropdowns. OOXML containing Japanese is
# not enough: ask Excel for the formulas it actually accepted and resolved on each kind of status cell.
completion_rules="$(cf_rules "$(table_cell sections status 0)")"
want_partial="$(translate_source Partial)"
want_not_started="$(translate_source 'Not started')"
case "$completion_rules" in
*"$want_partial"*"$want_not_started"* | *"$want_not_started"*"$want_partial"*) : ;;
*) fail "completion formatting does not compare the localized words '$want_partial' and '$want_not_started': $completion_rules" ;;
esac
milestone_rules="$(cf_rules "$(table_cell milestones status 0)")"
want_in_progress="$(translate_source 'In progress')"
want_pending="$(translate_source Pending)"
case "$milestone_rules" in
*"$want_in_progress"*"$want_pending"* | *"$want_pending"*"$want_in_progress"*) : ;;
*) fail "milestone formatting does not compare the localized words '$want_in_progress' and '$want_pending': $milestone_rules" ;;
esac
echo "    localized completion and milestone rules use the words their dropdowns show"
echo "PASS: every wash Excel resolved is warm and faint, and nothing paints a value that is done"

# And the part that matters: they have to FOLLOW an edit. Drop an element's score in Excel and the
# status beside it must change to whatever the engine says about the same deal with that score changed
# — computed by the engine here rather than written down, so this cannot drift from its rules.
status_col="$(jq -r '(.tables[] | select(.id == "sections") | .columns.status)' <<<"$uat_plan")"
status_row="$(jq -r '(.tables[] | select(.id == "sections") | .firstDataRow)' <<<"$uat_plan")"
status_cell="$(letters "$status_col")$status_row"
metrics_score="$(table_cell elements score 0)"
edited_deal="$WORK/status-edited.json"
jq '.qualification.metrics.score = 0' "$DEAL" >"$edited_deal" || fail "could not build the edited deal"
want_edited="$(bun "$PLUGIN_ROOT/engine/cli.ts" next "$edited_deal" | jq -r '.completionStatus.metrics')"
[ -n "$metrics_score" ] && [ -n "$status_cell" ] || fail "no cells to edit: score='$metrics_score' status='$status_cell'"
echo "==> setting $metrics_score to 0 and reading $status_cell back (engine says metrics becomes $want_edited)"
status_seen="$(
  osascript - "$SHEET" "$BOOK" "$metrics_score" "$status_cell" <<'OSA' 2>&1
on run argv
  set sheetName to item 1 of argv
  set bookName to item 2 of argv
  -- Pulled out of the tell block deliberately: inside one, `item n of argv` and the string it yields
  -- are resolved against Excel, and `range (item 3 of argv)` fails with -1728 rather than reading the
  -- cell. The rubric stage below has always assigned its refs first, for the same reason.
  set scoreRef to item 3 of argv
  set statusRef to item 4 of argv
  tell application "Microsoft Excel"
    set ws to worksheet sheetName of workbook bookName
    set scoreCell to range scoreRef of ws
    set statusCell to range statusRef of ws
    set original to (get value of scoreCell)
    set was to (get value of statusCell) as string
    -- Excel accepts a workbook before it has finished with it, so the write is confirmed before the
    -- dependent cell is polled, and each half reports its own timeout.
    repeat 40 times
      set value of scoreCell to 0
      calculate ws
      if (get value of scoreCell) = 0 then
        repeat 40 times
          calculate ws
          set nowText to (get value of statusCell) as string
          if nowText is not was then
            set value of scoreCell to original
            calculate ws
            return was & "|" & nowText
          end if
          delay 0.1
        end repeat
        set value of scoreCell to original
        return "TIMEOUT-status-did-not-follow-the-score"
      end if
      delay 0.25
    end repeat
    return "TIMEOUT-score-write-never-took"
  end tell
end run
OSA
)"
case "$status_seen" in
*"execution error"* | *"syntax error"*) fail "the completion-status check could not run: $status_seen" ;;
*"TIMEOUT-score-write-never-took"*) fail "Excel discarded the score write — it was still busy: $status_seen" ;;
*"TIMEOUT-status-did-not-follow-the-score"*) fail "the score changed and the completion status did not follow it" ;;
esac
status_displayed="$(cut -d'|' -f2 <<<"$status_seen")"
status_now="$(canonical_enum_value "$status_displayed")" ||
  fail "Excel returned an unrecognised completion label after the score edit: '$status_displayed'"
echo "    metrics was '$(cut -d'|' -f1 <<<"$status_seen")', became '$(cut -d'|' -f2 <<<"$status_seen")'"
[ "$status_now" = "$want_edited" ] || fail "Excel says metrics is '$status_now' at score 0; the engine says '$want_edited'"
echo "PASS: a completion status follows a score changed in Excel"

# The presentation primitives are the ones a unit test can least vouch for: a merge Excel
# rejects, a print setup it ignores, a gridline flag in the wrong place — all of them produce a
# file that still opens. So ask Excel what it made of them.
#
title_range="$(letters "$content_start")1:$(letters "$content_end")1"
merged_title="$(ask "merge cells of range \"$title_range\" of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
echo "    $SHEET!$title_range merged: ${merged_title:-<none>}"
[ "$merged_title" = "true" ] || fail "expected the title banner to be merged across $title_range, Excel reports '$merged_title'"

# The value belongs to the top-left cell; a merge that lost it would read back empty.
merged_text="$(ask "value of range \"$(letters "$content_start")1\" of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
echo "    the title cell reads: ${merged_text:-<empty>}"
[ -n "$merged_text" ] || fail "the merged title cell is empty — the merge swallowed its value"

# Every cell a merge covers has to carry the merge's own style, or the banner's fill stops at the
# first column and its border box breaks — a defect that is invisible to every assertion above.
#
# Asked through the FONT, not the interior: `color of interior` and `color index of interior` both
# read back "missing value" for a theme fill, which is non-empty and compares equal to itself, so an
# assertion built on them passes whatever the generator did. The banner's font is white and an
# unstyled cell's is black, which is a difference Excel will actually report.
banner_anchor="$(letters "$content_start")1"
banner_far="$(letters "$content_end")1"
banner_none="$(letters "$((content_end + 4))")1"
font_anchor="$(ask "color of font object of range \"$banner_anchor\" of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
font_far="$(ask "color of font object of range \"$banner_far\" of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
font_none="$(ask "color of font object of range \"$banner_none\" of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
echo "    banner font at $banner_anchor=${font_anchor:-<none>} at $banner_far=${font_far:-<none>}, unstyled $banner_none=${font_none:-<none>}"
[ -n "${font_anchor// /}" ] && [ "$font_anchor" != "missing value" ] || fail "could not read the banner's font colour ($font_anchor)"
# The styled and unstyled colours must differ, or comparing the two ends of the banner proves
# nothing: an unstyled sheet would satisfy it everywhere.
[ "$font_anchor" != "$font_none" ] || fail "a styled banner cell and an unstyled cell read the same font colour ($font_anchor) — this check cannot fail"
[ "$font_anchor" = "$font_far" ] || fail "the banner's style stops before $banner_far ($font_anchor vs $font_far) — a merge styled only at its anchor"

# A table's header row must NOT be merged into the row above it, which is what a mis-sized span
# looks like from here.
header_cell="$(table_header_cell stakeholders name)"
echo "    the stakeholders header sits at $header_cell"
[ -n "$header_cell" ] && [ "$header_cell" != "MISSING" ] || fail "the plan does not place the stakeholders header"

gridlines="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  activate object worksheet "$SHEET" of workbook "$BOOK"
  return (display gridlines of active window) as string
end tell
OSA
)"
echo "    gridlines shown on $SHEET: ${gridlines:-<none>}"
[ "$gridlines" = "false" ] || fail "expected gridlines hidden on $SHEET, Excel reports '$gridlines'"

# `page orientation`, not `orientation` — the latter is a different property that reads back
# "missing value" for a worksheet page setup, which looks exactly like Excel ignoring us.
orientation="$(ask "page orientation of page setup object of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
fit_wide="$(ask "fit to pages wide of page setup object of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
fit_tall="$(ask "fit to pages tall of page setup object of worksheet \"$SHEET\" of workbook \"$BOOK\"")"
echo "    print orientation: ${orientation:-<none>}, fit to pages wide/tall: ${fit_wide:-<none>}/${fit_tall:-<none>}"
[ "$orientation" = "landscape" ] || fail "expected landscape print orientation, Excel reports '$orientation'"
# One page wide, unlimited tall: a deal review is read by scrolling, not shrunk to nothing.
[ "$fit_wide" = "1" ] || fail "expected fit to 1 page wide, Excel reports '$fit_wide'"
[ "$fit_tall" = "0" ] || fail "expected unlimited page height, Excel reports '$fit_tall'"
echo "PASS: Excel accepts the merges, hides the grid and honours the print setup"

# ── Row heights, measured against Excel rather than argued about ────────────────────────────────
#
# Excel autofits a wrapped cell but NOT a merged one, and nearly every prose cell here is merged. So
# the generator computes each height, and if it computes short the text is clipped with nothing to
# notice: no error, no marker, just a sentence that ends early.
#
# Arithmetic cannot settle whether it computed enough — only Excel's own font metrics can. So each
# prose string is copied into a scratch cell of the same width in an UNMERGED column, Excel is asked
# to autofit that row, and its answer is compared with the height we wrote. Ours must be at least as
# tall.
#
# The scratch cell sits beyond the content in both directions, so it is off-screen for the
# screenshots below, and every measurement clears it and restores the row height afterwards.
scratch_col="$(letters "$((content_end + 8))")"
scratch_row=$(($(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$DEAL" --plan "${LOCALE_ARGS[@]}" | jq -r '.sheets[0].rows') + 40))
height_failures=0
height_checked=0

# The text goes to AppleScript as an ARGUMENT, and the script body is a quoted heredoc the shell does
# not touch. Interpolating it into the body instead was both wrong and dangerous: the example deal's
# strategy mentions "$400K SLA penalties", and the shell expanded `$4` to nothing, so Excel measured
# "00K SLA penalties" and the stage reported a pass for a string that was never in the workbook. A
# `$(…)` in a deal file would have run as a command. Neither is possible now, and a quote or a
# backslash in somebody's evidence measures correctly rather than being refused.
#
# `autofit (entire row of r)` — `autofit row N of ws` raises -10006 and `autofit range "…"` raises
# -50, and both of those return empty text that awk turns into 0, which compares as "Excel wants
# nothing" and makes this whole stage pass unconditionally. Verified against a deliberately
# under-allocating estimator: it reports SHORT for 33 of 83 cells.
measure_height() {
  osascript - "$SHEET" "$BOOK" "${scratch_col}${scratch_row}" "$1" "$2" 2>&1 <<'OSA'
on run argv
  set sheetName to item 1 of argv
  set bookName to item 2 of argv
  set cellRef to item 3 of argv
  set cellWidth to (item 4 of argv) as real
  set cellText to item 5 of argv
  tell application "Microsoft Excel"
    set r to range cellRef of worksheet sheetName of workbook bookName
    set column width of r to cellWidth
    set wrap text of r to true
    set value of r to cellText
    autofit (entire row of r)
    set h to (height of r)
    clear contents r
    set row height of r to 15
    return h as string
  end tell
end run
OSA
}

prose_rows="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$DEAL" --prose-heights "${LOCALE_ARGS[@]}")" ||
  fail "generate --prose-heights failed"
[ -n "$prose_rows" ] || fail "the plan reports no prose cells, so this stage cannot fail"
while IFS=$'\t' read -r ref width ours text; do
  [ -n "$ref" ] || continue
  theirs="$(measure_height "$width" "$text")"
  case "$theirs" in
  *"execution error"* | *"syntax error"*) fail "the height measurement could not run at $ref: $theirs" ;;
  esac
  [ -n "${theirs// /}" ] || fail "the height measurement returned nothing at $ref"
  height_checked=$((height_checked + 1))
  # Excel reports a float; compare as tenths so the shell never does float arithmetic.
  ours_tenths="$(awk -v v="$ours" 'BEGIN { printf "%d", v * 10 }')"
  theirs_tenths="$(awk -v v="$theirs" 'BEGIN { printf "%d", v * 10 }')"
  if [ "$theirs_tenths" -gt "$ours_tenths" ]; then
    echo "    SHORT $ref: ours=${ours}pt, Excel wants ${theirs}pt (${#text} characters at width $width)"
    height_failures=$((height_failures + 1))
  fi
done <<<"$prose_rows"
[ "$height_checked" -gt 0 ] || fail "the height stage measured nothing — it cannot fail as written"
echo "    measured $height_checked prose cell(s) against Excel's own autofit"
[ "$height_failures" = "0" ] || fail "$height_failures prose cell(s) are shorter than Excel needs — text is clipped"
echo "PASS: every computed row height is at least what Excel's autofit asks for"

# ── Hover notes ────────────────────────────────────────────────────────────────────────────────
#
# The eight element definitions are not on the sheet at all: they are notes on the element names, so
# they cost no width and no height. That makes them the one piece of the workbook a reader can only
# reach through the application, and the one piece no zip inspection can vouch for — a note needs a
# comments part, a legacy VML drawing, the worksheet's own relationships and two content-type
# declarations to agree with each other, and Excel's response to any disagreement is to drop the note
# and open the file anyway.
#
# So ask Excel. And compare against the SCHEMA rather than against the plan: the plan's text and the
# note both come from the generator, so they agree even when both are wrong.
read_note() {
  osascript - "$SHEET" "$1" "$2" 2>&1 <<'OSA'
on run argv
  tell application "Microsoft Excel"
    set ws to worksheet (item 1 of argv) of workbook (item 2 of argv)
    -- A cell with no note raises here rather than returning empty, which is the failure this wants.
    set theNote to Excel comment of range (item 3 of argv) of ws
    return Excel comment text theNote
  end tell
end run
OSA
}

# The elements in the order the table lays them out, from the engine — not a list written here, which
# would go stale the day MEDDPICC's eighth letter is spelled differently.
note_elements="$(bun "$PLUGIN_ROOT/engine/cli.ts" hint | jq -r '.elements[].element')" || fail "hint failed"
note_planned="$(jq '.notes | length' <<<"$uat_plan")"
note_wanted="$(wc -w <<<"$note_elements" | tr -d ' ')"
[ "$note_planned" = "$note_wanted" ] || fail "the plan carries $note_planned note(s) for $note_wanted element(s)"
echo "==> reading the $note_wanted element definitions back out of Excel"
note_index=0
for note_element in $note_elements; do
  note_ref="$(table_cell elements element "$note_index")"
  note_index=$((note_index + 1))
  note_want="$(jq -r --arg e "$note_element" \
    '.properties.qualification.properties[$e].properties.definition.const // "MISSING"' \
    "$PLUGIN_ROOT/schema/meddpicc-schema.json")"
  [ "$note_want" != "MISSING" ] && [ -n "$note_want" ] ||
    fail "the schema declares no definition for $note_element, so this stage would prove nothing"
  note_want="$(translate_source "$note_want")"
  note_got="$(read_note "$BOOK" "$note_ref")"
  case "$note_got" in
  *"execution error"* | *"syntax error"*)
    fail "Excel has no note on $note_ref ($note_element): $note_got"
    ;;
  esac
  [ "$note_got" = "$note_want" ] ||
    fail "the note on $note_ref reads '${note_got:0:60}', the schema says '${note_want:0:60}'"
done
[ "$note_index" = "$note_wanted" ] || fail "checked $note_index note(s), expected $note_wanted"
echo "PASS: Excel shows every element definition as a note on its element name"

# ── Screenshots ────────────────────────────────────────────────────────────────────────────────
#
# Everything above proves the workbook COMPUTES. None of it can see the sheet, and the current work
# is about how it looks — a column too narrow for its content, text clipped by a row height, a
# banner that stops short of the edge all pass every assertion above. So capture the thing and let a
# person look at it.
#
# Not a pixel baseline: no images are committed and nothing is compared. Baselines across Excel
# versions, fonts and display scales are a maintenance tax that buys less than one honest look.
# Deliberately NOT under $WORK: the script ends with `rm -rf "$WORK"`, so images written there are
# deleted the instant the run finishes and every path it printed is already dead. These exist to be
# looked at, so they outlive the run.
#
# Outside the repository too — .gitignore is governance-managed here, so a directory of PNGs inside
# the working tree would show up as untracked work in every later `git status`.
#
# A FRESH directory per run, and **nothing is ever deleted**. The first version cleared a fixed path
# with `rm -rf` before using it, which meant `MEDDPICC_UAT_SHOT_DIR=$HOME` recursively destroyed the
# operator's home directory — and it ran before the "screenshots disabled" check, so turning the stage
# off did not save you either. A unique directory also stops two concurrent runs from overwriting each
# other's evidence.
# MEDDPICC_UAT_SHOT_DIR names a PARENT, not the output directory: every run gets a fresh
# `run-XXXXXX` beneath it. That keeps "never deletes anything" literally true — even the permission
# probe only ever writes and removes a file inside a directory created moments earlier — and it stops
# two runs sharing output names in a caller-chosen directory.
SHOT_PARENT="${MEDDPICC_UAT_SHOT_DIR:-${TMPDIR:-/tmp}}"
mkdir -p "$SHOT_PARENT" || fail "could not create the screenshot parent directory $SHOT_PARENT"
SHOT_DIR="$(mktemp -d "$SHOT_PARENT/meddpicc-uat-shots.XXXXXX")" ||
  fail "could not create a screenshot directory under $SHOT_PARENT"

# `screencapture` needs Screen Recording permission, which a CI host will not have. Find out once,
# with a throwaway capture, so the stage can skip for a stated reason rather than emit black images.
#
# Two things about this tool, both learned the hard way:
#
#   1. It **exits 0 when it fails to write the file**, printing the reason on stderr. So the exit
#      code proves nothing, and every capture has to be checked by looking for the file.
#   2. It **refuses any destination whose name begins with a dot**. The first version of this probe
#      wrote `.probe.png`, which made a machine that captures perfectly well report that it had no
#      Screen Recording permission — and silently skip the whole stage on every run.
shots_available() {
  local probe="$SHOT_DIR/permission-probe.png"
  rm -f "$probe"
  screencapture -x -R "0,0,8,8" "$probe" >/dev/null 2>&1
  [ -s "$probe" ] || return 1
  rm -f "$probe"
  return 0
}

# Place OUR workbook's window at a known rectangle — never `window 1`, which may be the operator's
# own spreadsheet — and report the geometry it actually got.
#
# This runs BEFORE the pagination is measured, not inside each capture. Measuring the visible range
# of a window that is about to be made smaller overestimates how much fits, so the page count comes
# out too low and the bottom of the sheet is quietly never captured.
#
# Excel names its windows WITHOUT the file extension, which is why addressing them by "$BOOK" reads
# as "the object you are trying to access does not exist".
place_window() {
  local book="$1"
  osascript 2>&1 <<OSA
tell application "Microsoft Excel"
  activate
  set w to window "${book%.xlsx}"
  set left position of w to $SHOT_LEFT
  set top of w to $SHOT_TOP
  set width of w to $SHOT_WIDTH
  set height of w to $SHOT_HEIGHT
  return (((left position of w) as integer) as string) & "," & (((top of w) as integer) as string) & "," & (((width of w) as integer) as string) & "," & (((height of w) as integer) as string)
end tell
OSA
}

# One capture, of a window already placed.
capture() {
  local book="$1" sheet="$2" at_row="$3" at_col="$4" out="$5" geom="$6"
  local ok
  ok="$(
    osascript 2>&1 <<OSA
tell application "Microsoft Excel"
  activate
  set w to window "${book%.xlsx}"
  activate object worksheet "$sheet" of workbook "$book"
  set scroll row of w to $at_row
  set scroll column of w to $at_col
  -- Capturing a screen rectangle says nothing about which window is in it, so at least insist Excel
  -- is the application in front. It does not rule out a notification sitting on top.
  if not (frontmost) then error "Excel is not frontmost"
  return "ok"
end tell
OSA
  )"
  [ "$ok" = "ok" ] || {
    echo "    could not scroll $sheet to row $at_row column $at_col: ${ok:-<no output>}" >&2
    return 1
  }
  # Excel repaints asynchronously; capturing the instant after a scroll catches the old contents.
  sleep 1
  # No `|| return 1`: screencapture exits 0 even when it writes nothing. The checks below are the
  # only thing standing between a failed capture and a passing run.
  screencapture -x -R "$geom" "$out" >/dev/null 2>&1

  # An image that is missing, empty, or not the size we asked for is a failed capture, not a pass.
  # The pixel size is the point size times the display's backing scale, so check the RATIO rather
  # than hard-coding 2x — the same run must work on a Retina laptop and an external 1x monitor.
  local px py want_w want_h bytes
  px="$(sips -g pixelWidth "$out" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
  py="$(sips -g pixelHeight "$out" 2>/dev/null | awk '/pixelHeight/ {print $2}')"
  want_w="${geom#*,*,}"
  want_w="${want_w%,*}"
  want_h="${geom##*,}"
  [ -n "$px" ] && [ -n "$py" ] || {
    echo "    $out is not a readable image" >&2
    return 1
  }
  [ "$px" -ge "$want_w" ] && [ "$py" -ge "$want_h" ] || {
    echo "    $out is ${px}x${py}, smaller than the ${want_w}x${want_h} points requested" >&2
    return 1
  }
  # Same scale on both axes, or the rectangle captured is not the one asked for.
  [ $((px * want_h)) -eq $((py * want_w)) ] || {
    echo "    $out is ${px}x${py}, not proportional to the ${want_w}x${want_h} points requested" >&2
    return 1
  }
  # A blank or single-colour capture — a black frame from a refused permission, an unpainted window —
  # compresses to almost nothing, while a spreadsheet screenshot is hundreds of kilobytes. Crude, but
  # it separates "an image" from "an image of something".
  bytes="$(stat -f %z "$out" 2>/dev/null || echo 0)"
  [ "$bytes" -ge 20000 ] || {
    echo "    $out is only ${bytes} bytes — a blank or unpainted capture" >&2
    return 1
  }
  return 0
}

SHOT_LEFT=1
SHOT_TOP=1
SHOT_WIDTH=1400
SHOT_HEIGHT=880
# A cap so a runaway sheet cannot produce fifty images. It reports when it bites: a silent cap reads
# as "that is the whole sheet".
SHOT_MAX_SCREENS=6

if [ -n "${MEDDPICC_UAT_NO_SHOTS:-}" ]; then
  echo "SKIP: screenshots disabled by MEDDPICC_UAT_NO_SHOTS"
elif ! shots_available; then
  echo "SKIP: screenshots need Screen Recording permission for this terminal" \
    "(System Settings > Privacy & Security > Screen Recording) — the rest of the UAT still ran"
else
  shot_count=0
  # Ask Excel, not the plan: what is on screen is what is being judged.
  # `2>&1`, not `2>/dev/null`: an AppleScript error thrown away here reads as "there are no
  # worksheets", which is how this stage first failed with nothing to go on.
  sheets="$(
    osascript 2>&1 <<OSA
tell application "Microsoft Excel"
  set out to ""
  set n to count of worksheets of workbook "$BOOK"
  repeat with i from 1 to n
    set out to out & (get name of worksheet i of workbook "$BOOK") & linefeed
  end repeat
  return out
end tell
OSA
  )"
  case "$sheets" in
  '' | *"error"* | *"Can’t "* | *"Can't "*) fail "could not list the worksheets to capture: ${sheets:-<no output>}" ;;
  esac

  while IFS= read -r sheet; do
    [ -n "$sheet" ] || continue
    # Place the window FIRST, then measure what fits in it. Measuring a window that is about to be
    # resized is how the bottom of a sheet goes uncaptured while the stage still reports PASS.
    geom="$(place_window "$BOOK")"
    case "$geom" in
    [0-9]*,[0-9]*,[0-9]*,[0-9]*) ;;
    *) fail "could not place the Excel window for \"$sheet\": ${geom:-<no output>}" ;;
    esac

    metrics="$(
      osascript 2>&1 <<OSA
tell application "Microsoft Excel"
  set w to window "${BOOK%.xlsx}"
  activate object worksheet "$sheet" of workbook "$BOOK"
  set scroll row of w to 1
  set scroll column of w to 1
  set r to used range of worksheet "$sheet" of workbook "$BOOK"
  -- Joining an integer to a string builds a LIST in AppleScript, which then coerces to
  -- "52, ,, 38". Both sides have to be text before they are joined.
  return (((count of rows of r) as integer) as string) & "," & (((count of rows of (visible range of w)) as integer) as string) & "," & (((count of columns of r) as integer) as string) & "," & (((count of columns of (visible range of w)) as integer) as string)
end tell
OSA
    )"
    IFS=, read -r used_rows visible_rows used_cols visible_cols <<<"$metrics"
    case "${used_rows:-},${visible_rows:-},${used_cols:-},${visible_cols:-}" in
    [0-9]*,[0-9]*,[0-9]*,[0-9]*) ;;
    *) fail "could not measure sheet \"$sheet\": ${metrics:-<no output>}" ;;
    esac

    # Paginate BOTH axes. Scrolling rows only meant the right-hand columns of a wide sheet were never
    # captured at all, while the stage still reported PASS — and the columns most likely to be
    # mis-sized are the wide prose ones that fall off the right edge.
    row_step=$((visible_rows > 3 ? visible_rows - 2 : 1))
    col_step=$((visible_cols > 2 ? visible_cols - 1 : 1))
    row_screens=$(((used_rows + row_step - 1) / row_step))
    col_screens=$(((used_cols + col_step - 1) / col_step))
    [ "$row_screens" -lt 1 ] && row_screens=1
    [ "$col_screens" -lt 1 ] && col_screens=1
    screens=$((row_screens * col_screens))
    capped=""
    if [ "$screens" -gt "$SHOT_MAX_SCREENS" ]; then
      # Say what was dropped. A silent cap reads as "that is the whole sheet".
      capped=" (capped at $SHOT_MAX_SCREENS of $screens — part of this sheet was NOT captured)"
    fi

    safe="$(printf '%s' "$sheet" | tr -c 'A-Za-z0-9' '-')"
    taken=0
    cn=0
    while [ "$cn" -lt "$col_screens" ] && [ "$taken" -lt "$SHOT_MAX_SCREENS" ]; do
      col=$((cn * col_step + 1))
      rn=0
      while [ "$rn" -lt "$row_screens" ] && [ "$taken" -lt "$SHOT_MAX_SCREENS" ]; do
        row=$((rn * row_step + 1))
        out="$SHOT_DIR/$(printf '%02d' "$shot_count")-$safe-r$row-c$col.png"
        capture "$BOOK" "$sheet" "$row" "$col" "$out" "$geom" ||
          fail "capturing \"$sheet\" at row $row column $col failed"
        echo "    $out"
        shot_count=$((shot_count + 1))
        taken=$((taken + 1))
        rn=$((rn + 1))
      done
      cn=$((cn + 1))
    done
    echo "    $sheet: ${used_rows}x${used_cols} used, $taken capture(s)$capped"
  done <<<"$sheets"

  [ "$shot_count" -gt 0 ] || fail "the screenshot stage produced no images"
  echo "PASS: captured $shot_count verified screenshot(s)"
  echo "      look at them: open $SHOT_DIR"
fi

# A formula written as `C21` means "champion" only while the element rows are in their original
# order. Re-typing two of them is what a sort or a tidy-up does, and the scorecard has to follow the
# key rather than the address.
#
# Measured with the fixed-address form this replaced: Champion read 4.0, then 3.0 after the
# swap — economicBuyer's score, reported under the Champion label, with nothing to notice.
champ_cell="$(named championScore)"
elem_a="$(table_cell elements element 0)"
elem_b="$(table_cell elements element 7)"
score_a="$(table_cell elements score 0)"
score_b="$(table_cell elements score 7)"
echo "==> swapping the first and last element rows ($elem_a/$score_a <-> $elem_b/$score_b)"
swap_result="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  set ws to worksheet "$SHEET" of workbook "$BOOK"
  set nameA to (get value of range "$elem_a" of ws) as string
  set nameB to (get value of range "$elem_b" of ws) as string
  set scoreA to (get value of range "$score_a" of ws)
  set scoreB to (get value of range "$score_b" of ws)
  set wasVal to (get value of range "$champ_cell" of ws) as string
  set value of range "$elem_a" of ws to nameB
  set value of range "$score_a" of ws to scoreB
  set value of range "$elem_b" of ws to nameA
  set value of range "$score_b" of ws to scoreA
  set nowVal to (get value of range "$champ_cell" of ws) as string
  return wasVal & "|" & nowVal & "|" & nameA & "|" & nameB
end tell
OSA
)"
was_champ="$(cut -d'|' -f1 <<<"$swap_result")"
now_champ="$(cut -d'|' -f2 <<<"$swap_result")"
swapped_a="$(cut -d'|' -f3 <<<"$swap_result")"
swapped_b="$(cut -d'|' -f4 <<<"$swap_result")"
echo "    Champion score before moving its row = $was_champ, after = $now_champ"
# The swap has to have actually swapped something, or the comparison above holds for the wrong
# reason: two identical blank names would move nothing and the scores would agree trivially.
[ -n "$swapped_a" ] && [ "$swapped_a" != "$swapped_b" ] || fail "the two element rows read '$swapped_a' and '$swapped_b' — nothing was swapped, so this proves nothing"
[ -n "$was_champ" ] && [ "$was_champ" = "$now_champ" ] || fail "a keyed reference did not follow its key ($swap_result)"
echo "PASS: keyed references follow the key, so re-ordering the rows cannot mislabel a score"

# The rubric explains the score beside it, so it has to follow that score IN EXCEL. Written as a
# literal it went stale the moment anybody changed one — a contradiction on the screen during a live
# review, in the one column whose job is to explain the number next to it.
#
# So: change a score in Excel and ask Excel what the rubric now says. Only the application can answer
# that, because the answer is a formula it evaluates.
#
# **Waits for the recalculation.** AppleScript writes and reads faster than Excel recalculates, so
# reading straight after the write returns the value from before it — and then both readings match and
# the stage reports "the rubric is not following the score", which is a different diagnosis from the
# truth. This failed once and passed on the next run, which is the shape of a race and not of a bug.
# So each write is followed by `calculate` and a bounded poll, and a timeout says so in its own words.
rubric_cell="$(table_cell elements rubric 0)"
rubric_score="$(table_cell elements score 0)"
echo "==> changing $rubric_score and reading $rubric_cell back, waiting for each recalculation"
rubric_seen="$(
  osascript - "$SHEET" "$BOOK" "$rubric_score" "$rubric_cell" 2>&1 <<'OSA'
on run argv
  set sheetName to item 1 of argv
  set bookName to item 2 of argv
  set scoreRef to item 3 of argv
  set rubricRef to item 4 of argv
  tell application "Microsoft Excel"
    set ws to worksheet sheetName of workbook bookName
    set scoreCell to range scoreRef of ws
    set rubricCell to range rubricRef of ws
    set was to (get value of rubricCell) as string
    set original to (get value of scoreCell)
    set atZero to my scoreThenRead(ws, scoreCell, rubricCell, 0, was)
    set atFour to my scoreThenRead(ws, scoreCell, rubricCell, 4, atZero)
    set restored to my scoreThenRead(ws, scoreCell, rubricCell, original, atFour)
    return was & "|" & atZero & "|" & atFour & "|" & restored
  end tell
end run

-- Write the score, confirm the write TOOK, then wait for the rubric to follow it.
--
-- Both halves are needed and they fail differently. Excel accepts a workbook before it has finished
-- with it, so an early write is discarded with no error — the symptom is a later assertion reporting a
-- value that was never written, which is how this stage once claimed the rubric was not following the
-- score when the score had never changed. And a write that does take is not calculated by the time the
-- next question arrives. So: retry the write until the cell holds it, then poll for the dependent cell,
-- and say which of the two gave up.
--
-- `before` cannot be a parameter name here: AppleScript reserves it for positional references, and the
-- parse error — "Expected expression but found )" — points at the call rather than the handler.
on scoreThenRead(ws, scoreCell, rubricCell, newScore, priorText)
  tell application "Microsoft Excel"
    repeat 40 times
      set value of scoreCell to newScore
      calculate ws
      if (get value of scoreCell) = newScore then
        repeat 40 times
          calculate ws
          set nowText to (get value of rubricCell) as string
          if nowText is not priorText then return nowText
          delay 0.1
        end repeat
        return "TIMEOUT-rubric-did-not-follow-the-score"
      end if
      delay 0.25
    end repeat
    return "TIMEOUT-score-write-never-took"
  end tell
end scoreThenRead
OSA
)"
case "$rubric_seen" in
*"execution error"* | *"syntax error"*) fail "the rubric check could not run: $rubric_seen" ;;
*"TIMEOUT-score-write-never-took"*) fail "Excel discarded the score write — it was still busy: $rubric_seen" ;;
*"TIMEOUT-rubric-did-not-follow-the-score"*) fail "the score changed and the rubric did not follow it: $rubric_seen" ;;
esac
rub_was="$(cut -d'|' -f1 <<<"$rubric_seen")"
rub_zero="$(cut -d'|' -f2 <<<"$rubric_seen")"
rub_four="$(cut -d'|' -f3 <<<"$rubric_seen")"
rub_back="$(cut -d'|' -f4 <<<"$rubric_seen")"
echo "    at score 0: ${rub_zero:0:48}"
echo "    at score 4: ${rub_four:0:48}"
[ -n "${rub_zero// /}" ] && [ -n "${rub_four// /}" ] || fail "the rubric cell read back empty: $rubric_seen"
[ "$rub_zero" != "$rub_four" ] || fail "the rubric says the same thing at score 0 and score 4 — it is not following the score"
# What it says must be what the schema says, not merely something different.
want_zero="$(jq -r '.properties.qualification.properties.metrics.properties.scoreDefinition.default["0"]' "$PLUGIN_ROOT/schema/meddpicc-schema.json")"
want_four="$(jq -r '.properties.qualification.properties.metrics.properties.scoreDefinition.default["4"]' "$PLUGIN_ROOT/schema/meddpicc-schema.json")"
want_zero="$(translate_source "$want_zero")"
want_four="$(translate_source "$want_four")"
[ "$rub_zero" = "$want_zero" ] || fail "at score 0 the rubric reads '$rub_zero', the schema says '$want_zero'"
[ "$rub_four" = "$want_four" ] || fail "at score 4 the rubric reads '$rub_four', the schema says '$want_four'"
[ "$rub_back" = "$rub_was" ] || fail "restoring the score did not restore the rubric ('$rub_back' vs '$rub_was')"
echo "PASS: the rubric follows its score in Excel, and says what the schema says at each level"

# The rows are now genuinely out of order in an open workbook. Save it and read it back: this must be
# REFUSED, not read.
#
# The formulas survive a re-order — that is what the check above proves — but the reader's addresses
# do not. Before the anchor guard, reading this exact file proposed metrics 3 → 2 and competition
# 2 → 3, reported no rejection, and `--apply` would have written each element its neighbour's score.
echo "==> saving the re-ordered workbook and reading it back"
excel_do "saving the re-ordered workbook" "  save workbook \"$BOOK\"
  close workbook \"$BOOK\" saving no"

moved_before="$(jq -c '.qualification | to_entries | map({key, score: .value.score})' "$DEAL")"
moved_report="$(bun "$PLUGIN_ROOT/engine/cli.ts" read "$OUT" --deal "$DEAL" --apply)"
moved_code=$?
echo "    rejections: $(jq -c '[.rejections[] | {address, reason: (.reason | .[0:40])}]' <<<"$moved_report")"
[ "$moved_code" != "0" ] || fail "read exited 0 on a workbook whose rows had moved"
[ "$(jq -r '.proposals | length' <<<"$moved_report")" = "0" ] || fail "a re-ordered workbook produced proposals: $(jq -c '.proposals' <<<"$moved_report")"
[ "$(jq -r '.rejections | length' <<<"$moved_report")" != "0" ] || fail "a re-ordered workbook was accepted with no rejection"
jq -e '[.rejections[] | select(.reason | test("moved"))] | length > 0' <<<"$moved_report" >/dev/null ||
  fail "the refusal does not say the rows moved: $(jq -c '[.rejections[].reason]' <<<"$moved_report")"
# `--apply` was passed on purpose: a refusal that still wrote would be worse than reading it.
moved_after="$(jq -c '.qualification | to_entries | map({key, score: .value.score})' "$DEAL")"
[ "$moved_before" = "$moved_after" ] || fail "the deal's scores changed despite the refusal: $moved_before -> $moved_after"
echo "PASS: a workbook whose rows have moved is refused, and --apply writes nothing"

# Stage 3: the round trip, through a real save.
#
# This is the only check that can catch what Excel does to the file on the way out. The
# generator writes every string inline (`t="inlineStr"`); Excel re-saves the same text through
# `sharedStrings.xml` as `t="s"`. A reader that understands only its own output passes every
# unit test and then finds nothing in the one file that matters — the one a person edited.
#
# Two separate claims, in order:
#   1. Open and save WITHOUT editing anything, and the reader must still propose nothing.
#      Any proposal here is the reader misreading Excel's own format, not a human's edit.
#   2. Edit four cells of four different types, save, and each edit comes back exactly.
command -v jq >/dev/null 2>&1 || skip "jq unavailable for the round-trip case"

RT_DEAL="$WORK/rt-deal.json"
RT_OUT="$WORK/rt.xlsx"
RT_BOOK="$(basename "$RT_OUT")"
cp "$DEAL" "$RT_DEAL" || fail "could not copy the deal"
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$RT_DEAL" --out "$RT_OUT" "${LOCALE_ARGS[@]}" >/dev/null ||
  fail "generate failed for the round trip"

# Ask the plan where each field landed. Hard-coding an address here would make this pass while
# reading the wrong cell, which is the entire failure mode the inputCells map exists to prevent.
rt_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$RT_DEAL" --plan "${LOCALE_ARGS[@]}")" ||
  fail "generate --plan failed"
at() {
  jq -r --arg p "$1" --arg f "$2" '(.inputCells[] | select(.jsonPath == $p) | .[$f]) // "MISSING"' <<<"$rt_plan"
}
for field in metadata.accountName qualification.champion.score metadata.closeDate stakeholders[0].mustSayYes; do
  [ "$(at "$field" address)" != "MISSING" ] || fail "the plan has no input cell for $field"
done

echo "==> opening the round-trip workbook in Excel"
open -a "Microsoft Excel" "$RT_OUT" || fail "could not open the round-trip workbook"
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$RT_BOOK"; then
    rt_opened=1
    break
  fi
  sleep 2
done
[ "${rt_opened:-0}" = "1" ] || fail "Excel never listed $RT_BOOK"

# Claim 1: a save with no edits at all.
wait_until_ready "$RT_BOOK" "$(at metadata.accountName sheet)" "$(at metadata.accountName address)" ||
  fail "Excel never finished opening $RT_BOOK"
excel_do "the untouched save" "  save workbook \"$RT_BOOK\"
  close workbook \"$RT_BOOK\" saving no"
untouched="$(bun "$PLUGIN_ROOT/engine/cli.ts" read "$RT_OUT" --deal "$RT_DEAL")"
rt_code=$?
untouched_count="$(jq -r '.proposals | length' <<<"$untouched")"
untouched_rejects="$(jq -r '.rejections | length' <<<"$untouched")"
echo "    after Excel saved it untouched: $untouched_count proposal(s), $untouched_rejects rejection(s)"
[ "$rt_code" = "0" ] || fail "read exited $rt_code on a workbook Excel had merely saved"
[ "$untouched_count" = "0" ] || fail "Excel's own save produced $untouched_count phantom proposal(s): $(jq -c '.proposals' <<<"$untouched")"
[ "$untouched_rejects" = "0" ] || fail "Excel's own save produced rejections: $(jq -c '.rejections' <<<"$untouched")"
echo "PASS: a save by Excel does not read as an edit"

# Claim 2: four edits, four types — a string, a 0-4 score, a date typed as text, a boolean.
echo "==> editing four cells in Excel and saving"
open -a "Microsoft Excel" "$RT_OUT" || fail "could not reopen the round-trip workbook"
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$RT_BOOK"; then
    break
  fi
  sleep 2
done

wait_until_ready "$RT_BOOK" "$(at metadata.accountName sheet)" "$(at metadata.accountName address)" ||
  fail "Excel never finished opening $RT_BOOK"

# The file just reopened is Excel's OWN, saved a moment ago by its comments and VML code rather than
# by ours. A deal review gets shared and saved, so a note that Excel drops on the way out is a note
# nobody sees again — and this reopen is the only point in the run where anything has been through
# Excel's writer.
rt_note_ref="$(jq -r '.notes[0].address // "MISSING"' <<<"$rt_plan")"
rt_note_want="$(jq -r '.notes[0].text // "MISSING"' <<<"$rt_plan")"
[ "$rt_note_ref" != "MISSING" ] && [ "$rt_note_want" != "MISSING" ] ||
  fail "the round-trip plan carries no notes, so this check would prove nothing"
rt_note_got="$(read_note "$RT_BOOK" "$rt_note_ref")"
case "$rt_note_got" in
*"execution error"* | *"syntax error"*)
  fail "Excel's own save dropped the note on $rt_note_ref: $rt_note_got"
  ;;
esac
[ "$rt_note_got" = "$rt_note_want" ] ||
  fail "after Excel saved it, the note on $rt_note_ref reads '${rt_note_got:0:60}', not '${rt_note_want:0:60}'"
echo "PASS: a note survives a save by Excel itself"

# Writing, saving and closing in one breath hid which of the three failed. When the save did not
# reach disk the reader saw the untouched file, reported no proposals, and this script blamed
# `metadata.accountName` for "coming back as MISSING" — an accurate symptom pointing at the wrong
# component. So each step is now checked on its own terms.
#
# `range`, not `cell`: reads work through either, but a write through `cell` fails.
#
# The boolean is typed as the WORD, which is what the dropdown offers and what the scorecard counts.
# Writing `false` here made Excel store a logical value, which the reader refuses for exactly that
# reason: the cell would say FALSE while the count beside it went on including it.
no_word="$(translate_source No)"
excel_do "the four hand edits" "  set wb to workbook \"$RT_BOOK\"
  set value of range \"$(at metadata.accountName address)\" of worksheet \"$(at metadata.accountName sheet)\" of wb to \"Globex Corporation\"
  set value of range \"$(at qualification.champion.score address)\" of worksheet \"$(at qualification.champion.score sheet)\" of wb to 2
  set value of range \"$(at metadata.closeDate address)\" of worksheet \"$(at metadata.closeDate sheet)\" of wb to \"2026-09-15\"
  set value of range \"$(at 'stakeholders[0].mustSayYes' address)\" of worksheet \"$(at 'stakeholders[0].mustSayYes' sheet)\" of wb to \"$no_word\"
  if ((get value of range \"$(at metadata.accountName address)\" of worksheet \"$(at metadata.accountName sheet)\" of wb) as string) is not \"Globex Corporation\" then error \"the accountName write did not take in the open workbook\""

# What the file looked like before Excel was asked to save it.
rt_before="$(stat -f '%m %z' "$RT_OUT")"

excel_do "saving and closing the edited workbook" "  set wb to workbook \"$RT_BOOK\"
  save wb
  close wb saving no"

# Excel reports a successful `save` before the bytes are necessarily on disk, and a workbook that
# closes without flushing leaves the reader looking at the file as it was.
for _ in $(seq 1 30); do
  [ "$(stat -f '%m %z' "$RT_OUT")" != "$rt_before" ] && break
  sleep 1
done
[ "$(stat -f '%m %z' "$RT_OUT")" != "$rt_before" ] ||
  fail "Excel reported saving $RT_BOOK but the file on disk is unchanged ($rt_before) — the edits never reached it"

edited="$(bun "$PLUGIN_ROOT/engine/cli.ts" read "$RT_OUT" --deal "$RT_DEAL")"
edited_code=$?
echo "    proposals: $(jq -c '[.proposals[] | {jsonPath, to}]' <<<"$edited")"
[ "$edited_code" = "0" ] || fail "read exited $edited_code after four hand edits: $(jq -c '.rejections' <<<"$edited")"
[ "$(jq -r '.rejections | length' <<<"$edited")" = "0" ] || fail "hand edits were rejected: $(jq -c '.rejections' <<<"$edited")"

proposed() {
  jq -r --arg p "$1" '(.proposals[] | select(.jsonPath == $p) | .to | tostring) // "MISSING"' <<<"$edited"
}
for pair in \
  "metadata.accountName=Globex Corporation" \
  "qualification.champion.score=2" \
  "metadata.closeDate=2026-09-15" \
  "stakeholders[0].mustSayYes=false"; do
  want="${pair#*=}"
  got="$(proposed "${pair%%=*}")"
  echo "    ${pair%%=*}: Excel proposed [$got], expected [$want]"
  [ "$got" = "$want" ] || fail "${pair%%=*} came back as '$got', expected '$want'"
done
[ "$(jq -r '.proposals | length' <<<"$edited")" = "4" ] || fail "expected exactly 4 proposals, got $(jq -r '.proposals | length' <<<"$edited")"

# And applying them lands a deal that still validates.
bun "$PLUGIN_ROOT/engine/cli.ts" read "$RT_OUT" --deal "$RT_DEAL" --apply >/dev/null || fail "read --apply exited non-zero"
bun "$PLUGIN_ROOT/engine/cli.ts" validate "$RT_DEAL" >/dev/null || fail "the applied deal does not validate"
applied_name="$(jq -r '.metadata.accountName' "$RT_DEAL")"
applied_date="$(jq -r '.metadata.closeDate' "$RT_DEAL")"
applied_score="$(jq -r '.qualification.champion.score' "$RT_DEAL")"
applied_flag="$(jq -r '.stakeholders[0].mustSayYes' "$RT_DEAL")"
echo "    applied: $applied_name / $applied_date / score $applied_score / mustSayYes $applied_flag"
[ "$applied_name" = "Globex Corporation" ] || fail "the applied deal says accountName='$applied_name'"
[ "$applied_date" = "2026-09-15" ] || fail "the applied deal says closeDate='$applied_date'"
[ "$applied_score" = "2" ] || fail "the applied deal says champion score='$applied_score'"
[ "$applied_flag" = "false" ] || fail "the applied deal says mustSayYes='$applied_flag'"

# Applying is idempotent: with the JSON now agreeing with the sheet, there is nothing to propose.
again="$(bun "$PLUGIN_ROOT/engine/cli.ts" read "$RT_OUT" --deal "$RT_DEAL")" || fail "the second read exited non-zero"
[ "$(jq -r '.proposals | length' <<<"$again")" = "0" ] || fail "a second read still proposes $(jq -c '.proposals' <<<"$again")"
echo "PASS: edits made in Excel round-trip into the deal JSON, and applying them twice changes nothing"

# ── A list entry with no name ──────────────────────────────────────────────────────────────────
#
# The schema permits an entry that fills in anything but its first field: `team.internal:
# [{"role":"SE"}]` validates, and the engine counts it, so the team is complete. A sheet that counted
# only the leftmost column would answer not_started on that data — a completion status contradicting
# `engine next`, which is the one thing the compiled rules exist to prevent. The second-opinion review
# found it; this is the case it named.
nameless="$WORK/nameless.json"
jq '.team.internal = [{"role": "Solutions Engineer"}]
  | .closePlan.milestones = [{"owner": "<ACCOUNT_EXECUTIVE>", "targetDate": "2026-06-01"}]' "$DEAL" >"$nameless" ||
  fail "could not build the nameless-entry deal"
bun "$PLUGIN_ROOT/engine/cli.ts" validate "$nameless" >/dev/null || fail "the nameless-entry deal does not validate"
nameless_out="$WORK/nameless.xlsx"
nameless_book="$(basename "$nameless_out")"
OUR_WORKBOOKS+=("$nameless_book")
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$nameless" --out "$nameless_out" "${LOCALE_ARGS[@]}" >/dev/null ||
  fail "generate failed on the nameless-entry deal"
nameless_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$nameless" --plan "${LOCALE_ARGS[@]}")" ||
  fail "generate --plan failed"
echo "==> opening a deal whose team member has a role and no name"
open -a "Microsoft Excel" "$nameless_out" || fail "could not open $nameless_book"
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$nameless_book"; then
    nameless_opened=1
    break
  fi
  sleep 2
done
[ "${nameless_opened:-0}" = "1" ] || fail "Excel never listed $nameless_book"
compare_statuses "$nameless_book" "$nameless" "$nameless_plan" "a deal with unnamed list entries"
osascript -e "tell application \"Microsoft Excel\" to close workbook \"$nameless_book\" saving no" >/dev/null 2>&1
echo "PASS: an entry that fills in anything but its first field counts on the sheet as it does in the engine"

# A row typed UNDER the last padded one, which is what running out of room looks like.
#
# A list's capacity is the rows the generator laid out and nothing beyond them: the row under the
# stakeholder table is the gap before the next section's banner, and the banner is the row after
# that. So content typed there is REPORTED with what to do about it — add the entry to the deal JSON
# and regenerate — and never read as a new entry. Reading downward on one sheet would eventually
# append a banner's own title as a stakeholder.
#
# Only real Excel can show this end to end: the unit tests inject the cell into the XML themselves,
# while Excel decides what a cell typed below a table actually becomes in the saved file.
#
# The padded rows have to be FULL for the case to be about overflow at all, so the fixture fills
# every one of them.
GROWN_DEAL="$WORK/grown.json"
grown_capacity="$(jq -r '(.sheets[].blocks[] | select(.kind == "table" and .table.id == "stakeholders") | .table.minRows)' \
  "$PLUGIN_ROOT/engine/workbook-spec.json")"
[ -n "$grown_capacity" ] && [ "$grown_capacity" != "null" ] || fail "the spec declares no minRows for the stakeholders table"
jq --argjson n "$grown_capacity" '
  .stakeholders = [range($n) | {name: ("Person " + (.+1|tostring)), title: "VP", roleInDeal: "Influencer"}]
' "$DEAL" >"$GROWN_DEAL" || fail "could not build the full-table deal"

GROWN_OUT="$WORK/grown.xlsx"
GROWN_BOOK="$(basename "$GROWN_OUT")"
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$GROWN_DEAL" --out "$GROWN_OUT" "${LOCALE_ARGS[@]}" >/dev/null ||
  fail "generate failed for the overflow case"

# Ask the plan where the table ends rather than assuming; the row below it is the one to type into.
grown_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$GROWN_DEAL" --plan "${LOCALE_ARGS[@]}")" ||
  fail "generate --plan failed"
grown_sheet="$(jq -r '(.tables[] | select(.id == "stakeholders") | .sheet)' <<<"$grown_plan")"
grown_first="$(jq -r '(.tables[] | select(.id == "stakeholders") | .firstDataRow)' <<<"$grown_plan")"
grown_rows="$(jq -r '(.tables[] | select(.id == "stakeholders") | .rows)' <<<"$grown_plan")"
[ "$grown_rows" = "$grown_capacity" ] || fail "the plan shows $grown_rows stakeholder rows, the spec asks for $grown_capacity"
last_row=$((grown_first + grown_rows - 1))
grown_row=$((last_row + 1))
# A stakeholder needs name, title and roleInDeal — the schema requires all three — so type a whole
# one, which is what somebody who has run out of rows would do.
col_for() {
  jq -r --arg c "$1" '(.tables[] | select(.id == "stakeholders") | .columns[$c])' <<<"$grown_plan"
}
name_col="$(letters "$(col_for name)")"
title_col="$(letters "$(col_for title)")"
role_col="$(letters "$(col_for roleInDeal)")"
grown_ref="$name_col$grown_row"
echo "==> typing a stakeholder into $grown_sheet row $grown_row, one row under the last of $grown_rows"

open -a "Microsoft Excel" "$GROWN_OUT" || fail "could not open the overflow workbook"
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$GROWN_BOOK"; then
    break
  fi
  sleep 2
done

wait_until_ready "$GROWN_BOOK" "$grown_sheet" "$name_col$last_row" ||
  fail "Excel never finished opening $GROWN_BOOK"
excel_do "the overflowing stakeholder row" "  set wb to workbook \"$GROWN_BOOK\"
  set value of range \"$name_col$grown_row\" of worksheet \"$grown_sheet\" of wb to \"<NEW_STAKEHOLDER_1>\"
  set value of range \"$title_col$grown_row\" of worksheet \"$grown_sheet\" of wb to \"VP Platform\"
  set value of range \"$role_col$grown_row\" of worksheet \"$grown_sheet\" of wb to \"Influencer\"
  save wb
  close wb saving no"

grown_before="$(jq -r '.stakeholders | length' "$GROWN_DEAL")"
grown_report="$(bun "$PLUGIN_ROOT/engine/cli.ts" read "$GROWN_OUT" --deal "$GROWN_DEAL")"
grown_code=$?
echo "    rejections: $(jq -c '[.rejections[] | {address, reason}]' <<<"$grown_report")"
# A refusal, and a non-zero exit: a caller that only checks the code must not apply this run.
[ "$grown_code" != "0" ] || fail "read exited 0 on content the workbook has no room for"
[ "$(jq -r '.proposals | length' <<<"$grown_report")" = "0" ] || fail "the overflowing row became a proposal: $(jq -c '.proposals' <<<"$grown_report")"
[ "$(jq -r '.rejections | length' <<<"$grown_report")" = "3" ] || fail "expected one rejection per typed cell, got $(jq -c '.rejections' <<<"$grown_report")"
[ "$(jq -r --arg ref "$grown_ref" '[.rejections[] | select(.address == $ref)] | length' <<<"$grown_report")" = "1" ] ||
  fail "no rejection names $grown_ref: $(jq -c '[.rejections[].address]' <<<"$grown_report")"
# The message has to say what to do, because there is nothing the reader can do for them.
jq -e '[.rejections[] | select(.reason | test("regenerate"))] | length == 3' <<<"$grown_report" >/dev/null ||
  fail "a rejection does not say to regenerate: $(jq -c '[.rejections[].reason]' <<<"$grown_report")"

# And --apply changes nothing at all, which is the part that matters: a refusal that still wrote
# would be worse than reading the row.
bun "$PLUGIN_ROOT/engine/cli.ts" read "$GROWN_OUT" --deal "$GROWN_DEAL" --apply >/dev/null 2>&1
grown_after="$(jq -r '.stakeholders | length' "$GROWN_DEAL")"
echo "    stakeholders before=$grown_before after=$grown_after"
[ "$grown_after" = "$grown_before" ] || fail "the refused row was applied anyway ($grown_before -> $grown_after)"
bun "$PLUGIN_ROOT/engine/cli.ts" validate "$GROWN_DEAL" >/dev/null || fail "the deal no longer validates after a refused read"
echo "PASS: a row typed below the padded ones is refused by its address, and nothing is written"

# The same comparison on a deal where most elements are unscored — the case that was wrong.
#
# MEDDPICC scores out of 32 whether or not anyone has assessed an element yet. With the
# denominator written as COUNT(score)*4, blanks shrank it: one element at 4 and seven unscored
# displayed 4/4 = 100% beside a Red rating. The engine said 12.5%. A forecast document that
# flatters an unqualified deal is worse than no document, so this stays checked.
command -v jq >/dev/null 2>&1 || {
  echo "SKIP: jq unavailable for the partial-deal case"
  exit 0
}

PARTIAL="$WORK/partial.json"
jq '(.qualification | keys[]) as $k | .' "$DEAL" >/dev/null 2>&1 || fail "cannot read $DEAL as JSON"
jq '
  .qualification |= with_entries(if .key == "metrics" then . else (.value |= del(.score)) end)
  | .qualification.metrics.score = 4
  | .scoring = { elementScores: { metrics: 4 } }
' "$DEAL" >"$PARTIAL" || fail "could not build the partial deal"

PARTIAL_OUT="$WORK/uat-partial.xlsx"
PARTIAL_BOOK="$(basename "$PARTIAL_OUT")"
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PARTIAL" --out "$PARTIAL_OUT" "${LOCALE_ARGS[@]}" >/dev/null ||
  fail "generate failed on the partial deal"

partial_score="$(bun "$PLUGIN_ROOT/engine/cli.ts" score "$PARTIAL")" || fail "score failed on the partial deal"
want_partial_pct="$(jq -r '.overallScore' <<<"$partial_score")"

echo "==> opening the partial deal in Excel"
open -a "Microsoft Excel" "$PARTIAL_OUT" || fail "could not open the partial workbook"
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$PARTIAL_BOOK"; then
    partial_opened=1
    break
  fi
  sleep 2
done
[ "${partial_opened:-0}" = "1" ] || fail "Excel never listed $PARTIAL_BOOK"

# By name from this deal's own plan: the partial deal has fewer answers, so its rows sit elsewhere.
partial_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PARTIAL" --plan "${LOCALE_ARGS[@]}")" ||
  fail "generate --plan failed on the partial deal"
partial_pct_cell="$(jq -r '.namedCells.scorePercent // "MISSING"' <<<"$partial_plan")"
[ "$partial_pct_cell" != "MISSING" ] || fail "the partial plan has no scorePercent cell"
got_partial_raw="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  return (get value of cell "${partial_pct_cell##*!}" of worksheet "$SHEET" of workbook "$PARTIAL_BOOK") as string
end tell
OSA
)"
got_partial="$(awk -v v="$got_partial_raw" 'BEGIN { printf "%.1f", v * 100 }')"
echo "    partly-qualified overall score: Excel=$got_partial% engine=$want_partial_pct%"
# The statuses too, on a deal where most sections are NOT complete — the example deal is nearly
# finished, so on its own it exercises mostly the complete branch of every rule.
compare_statuses "$PARTIAL_BOOK" "$PARTIAL" "$partial_plan" "the partly-qualified deal"
osascript -e "tell application \"Microsoft Excel\" to close workbook \"$PARTIAL_BOOK\" saving no" >/dev/null 2>&1
[ "$got_partial" = "$want_partial_pct" ] || fail "Excel showed $got_partial% for a partly-qualified deal, engine says $want_partial_pct%"

rm -rf "$WORK"
echo "PASS: a partly-qualified deal reads the same in Excel as in the engine"
