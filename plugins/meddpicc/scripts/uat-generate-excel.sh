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

# The workbook is ONE laid-out sheet, and nothing on it has a fixed address: a table starts wherever
# the blocks above it end. So every address this script types into comes from `generate --plan` —
# the generator's own map — rather than from a row number written here, which would go stale the
# first time a section moved.
SHEET="$(jq -r '.sheets[0].name' "$PLUGIN_ROOT/engine/workbook-spec.json")"
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

# Start from a clean slate for the same reason, still only among our own names.
close_our_workbooks

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

echo "==> generating $OUT"
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$DEAL" --out "$OUT" >/dev/null || fail "generate exited non-zero"

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
uat_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$DEAL" --plan)" || fail "generate --plan failed"
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
  osascript <<OSA 2>&1
tell application "Microsoft Excel"
  set errs to ""
  set n to count of worksheets of workbook "$BOOK"
  repeat with i from 1 to n
    set ws to worksheet i of workbook "$BOOK"
    set vals to (get string value of (get used range of ws))
    repeat with rw in vals
      repeat with v in rw
        if (v as string) is in {"#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "#NULL!", "#NUM!"} then
          set errs to errs & (get name of ws) & ":" & (v as string) & " "
        end if
      end repeat
    end repeat
  end repeat
  return errs
end tell
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
assert_no_error_values "after clearing the planted one"
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
want_roles="$(jq -r '.properties.stakeholders.items.properties.roleInDeal.enum | join(",")' "$PLUGIN_ROOT/schema/meddpicc-schema.json")"
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
[ "$got_bool" = "Yes,No" ] || fail "the boolean dropdown is '$got_bool', expected Yes,No"
echo "PASS: Excel recognises the conditional formats and the schema-derived dropdowns, and sees no Excel Table"

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
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$RT_DEAL" --out "$RT_OUT" >/dev/null || fail "generate failed for the round trip"

# Ask the plan where each field landed. Hard-coding an address here would make this pass while
# reading the wrong cell, which is the entire failure mode the inputCells map exists to prevent.
rt_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$RT_DEAL" --plan)" || fail "generate --plan failed"
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

# Writing, saving and closing in one breath hid which of the three failed. When the save did not
# reach disk the reader saw the untouched file, reported no proposals, and this script blamed
# `metadata.accountName` for "coming back as MISSING" — an accurate symptom pointing at the wrong
# component. So each step is now checked on its own terms.
#
# `range`, not `cell`: reads work through either, but a write through `cell` fails.
excel_do "the four hand edits" "  set wb to workbook \"$RT_BOOK\"
  set value of range \"$(at metadata.accountName address)\" of worksheet \"$(at metadata.accountName sheet)\" of wb to \"Globex Corporation\"
  set value of range \"$(at qualification.champion.score address)\" of worksheet \"$(at qualification.champion.score sheet)\" of wb to 2
  set value of range \"$(at metadata.closeDate address)\" of worksheet \"$(at metadata.closeDate sheet)\" of wb to \"2026-09-15\"
  set value of range \"$(at 'stakeholders[0].mustSayYes' address)\" of worksheet \"$(at 'stakeholders[0].mustSayYes' sheet)\" of wb to false
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
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$GROWN_DEAL" --out "$GROWN_OUT" >/dev/null || fail "generate failed for the overflow case"

# Ask the plan where the table ends rather than assuming; the row below it is the one to type into.
grown_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$GROWN_DEAL" --plan)" || fail "generate --plan failed"
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
  set value of range \"$name_col$grown_row\" of worksheet \"$grown_sheet\" of wb to \"Dana Reyes\"
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
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PARTIAL" --out "$PARTIAL_OUT" >/dev/null || fail "generate failed on the partial deal"

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
partial_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$PARTIAL" --plan)" || fail "generate --plan failed on the partial deal"
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
osascript -e "tell application \"Microsoft Excel\" to close workbook \"$PARTIAL_BOOK\" saving no" >/dev/null 2>&1
[ "$got_partial" = "$want_partial_pct" ] || fail "Excel showed $got_partial% for a partly-qualified deal, engine says $want_partial_pct%"

rm -rf "$WORK"
echo "PASS: a partly-qualified deal reads the same in Excel as in the engine"
