#!/usr/bin/env bash
# uat-generate-excel.sh — open a generated workbook in real Excel and check it computed.
#
# The unit tests assert what we WRITE. They cannot assert what Excel makes of it, and that
# is the part with the interesting failure modes: a malformed part makes Excel offer to
# repair rather than open, a date written as text turns arithmetic into #VALUE!, and a
# formula referring to the wrong range is perfectly well-formed and silently wrong.
#
# So this drives the real application: generate, open, read the Scorecard back, and compare
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
command -v osascript >/dev/null 2>&1 || skip "not macOS (no osascript)"
[ -d "/Applications/Microsoft Excel.app" ] || skip "Microsoft Excel is not installed"

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
# one — and the next run then read the Scorecard out of the stale copy and reported an empty rating,
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

# Find the Scorecard rows by their labels rather than hard-coded addresses: the layout comes
# from the spec, so pinning row numbers here would make this fail on a harmless reorder.
find_value() {
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  repeat with r from 1 to 60
    set a to (get value of cell ("A" & r) of worksheet "Scorecard" of workbook "$BOOK")
    if (a as string) is "$1" then
      return (get value of cell ("B" & r) of worksheet "Scorecard" of workbook "$BOOK") as string
    end if
  end repeat
  return "NOT-FOUND"
end tell
OSA
}

got_sum="$(find_value 'Total score')"
got_rating="$(find_value 'Rating')"
got_pct_raw="$(find_value 'Overall score')"

echo "    Total score: Excel=$got_sum engine=$want_sum"
[ "${got_sum%.*}" = "$want_sum" ] || fail "Excel computed $got_sum, engine says $want_sum"

echo "    Rating: Excel=$got_rating engine=$want_rating"
[ "$got_rating" = "$want_rating" ] || fail "Excel rated $got_rating, engine says $want_rating"

# Excel holds the fraction; the engine reports a percentage to one decimal.
got_pct="$(awk -v v="$got_pct_raw" 'BEGIN { printf "%.1f", v * 100 }')"
echo "    Overall score: Excel=$got_pct% engine=$want_pct%"
[ "$got_pct" = "$want_pct" ] || fail "Excel computed $got_pct%, engine says $want_pct%"

# A formula pointing at the wrong range is well-formed and wrong; an error value is at least
# loud. Check for the loud ones across every sheet.
errors="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  set errs to ""
  repeat with ws in every worksheet of workbook "$BOOK"
    try
      set vals to (get value of (get used range of ws))
      repeat with rw in vals
        repeat with v in rw
          set s to (v as string)
          if s is in {"#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "#NULL!", "#NUM!"} then
            set errs to errs & (get name of ws) & ":" & s & " "
          end if
        end repeat
      end repeat
    end try
  end repeat
  return errs
end tell
OSA
)"
[ -z "${errors// /}" ] || fail "Excel error values present: $errors"
echo "    no Excel error values on any sheet"

echo "PASS: Excel opened the generated workbook and its Scorecard agrees with the engine"

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

tables_seen="$(ask "count of list objects of worksheet \"Stakeholders\" of workbook \"$BOOK\"")"
echo "    Excel sees ${tables_seen:-<none>} table(s) on Stakeholders"
[ "$tables_seen" = "1" ] || fail "expected 1 Excel Table on Stakeholders, Excel reports '$tables_seen'"

rules_seen="$(ask "count of format conditions of range \"C2:C9\" of worksheet \"Qualification\" of workbook \"$BOOK\"")"
echo "    Excel sees ${rules_seen:-<none>} conditional-format rule(s) on the score column"
[ "$rules_seen" = "3" ] || fail "expected 3 conditional-format rules on the score column, Excel reports '$rules_seen'"

# The point of deriving dropdowns from the schema is that they cannot drift from it, so compare
# what Excel offers against what the schema says rather than against a literal repeated here.
want_roles="$(jq -r '.properties.stakeholders.items.properties.roleInDeal.enum | join(",")' "$PLUGIN_ROOT/schema/meddpicc-schema.json")"
got_roles="$(ask "formula1 of (validation of range \"C2\" of worksheet \"Stakeholders\" of workbook \"$BOOK\")")"
echo "    role dropdown: Excel=[$got_roles] schema=[$want_roles]"
[ "$got_roles" = "$want_roles" ] || fail "the role dropdown does not match the schema enum"

got_scores="$(ask "formula1 of (validation of range \"C2\" of worksheet \"Qualification\" of workbook \"$BOOK\")")"
echo "    score dropdown: Excel=[$got_scores]"
[ "$got_scores" = "0,1,2,3,4" ] || fail "the score dropdown is '$got_scores', expected 0,1,2,3,4"
echo "PASS: Excel recognises the tables, the conditional formats and the schema-derived dropdowns"

# The presentation primitives are the ones a unit test can least vouch for: a merge Excel
# rejects, a print setup it ignores, a gridline flag in the wrong place — all of them produce a
# file that still opens. So ask Excel what it made of them.
merged_title="$(ask "merge cells of range \"A1:B1\" of worksheet \"Deal\" of workbook \"$BOOK\"")"
echo "    Deal!A1:B1 merged: ${merged_title:-<none>}"
[ "$merged_title" = "true" ] || fail "expected the title banner to be merged, Excel reports '$merged_title'"

# The value belongs to the top-left cell; a merge that lost it would read back empty.
merged_text="$(ask "value of range \"A1\" of worksheet \"Deal\" of workbook \"$BOOK\"")"
echo "    Deal!A1 reads: ${merged_text:-<empty>}"
[ -n "$merged_text" ] || fail "the merged title cell is empty — the merge swallowed its value"

# A table sheet must have NO merge anywhere in its table range: Excel silently drops a table
# that contains one, and the drop is only visible as the table count falling to zero.
merged_in_table="$(ask "merge cells of range \"A1:H2\" of worksheet \"Stakeholders\" of workbook \"$BOOK\"")"
echo "    Stakeholders!A1:H2 merged: ${merged_in_table:-<none>}"
[ "$merged_in_table" = "false" ] || fail "a merge inside the Stakeholders table range would make Excel drop the table"

gridlines="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  activate object worksheet "Deal" of workbook "$BOOK"
  return (display gridlines of active window) as string
end tell
OSA
)"
echo "    gridlines shown on Deal: ${gridlines:-<none>}"
[ "$gridlines" = "false" ] || fail "expected gridlines hidden on Deal, Excel reports '$gridlines'"

# `page orientation`, not `orientation` — the latter is a different property that reads back
# "missing value" for a worksheet page setup, which looks exactly like Excel ignoring us.
orientation="$(ask "page orientation of page setup object of worksheet \"Deal\" of workbook \"$BOOK\"")"
fit_wide="$(ask "fit to pages wide of page setup object of worksheet \"Deal\" of workbook \"$BOOK\"")"
fit_tall="$(ask "fit to pages tall of page setup object of worksheet \"Deal\" of workbook \"$BOOK\"")"
echo "    print orientation: ${orientation:-<none>}, fit to pages wide/tall: ${fit_wide:-<none>}/${fit_tall:-<none>}"
[ "$orientation" = "landscape" ] || fail "expected landscape print orientation, Excel reports '$orientation'"
# One page wide, unlimited tall: a deal review is read by scrolling, not shrunk to nothing.
[ "$fit_wide" = "1" ] || fail "expected fit to 1 page wide, Excel reports '$fit_wide'"
[ "$fit_tall" = "0" ] || fail "expected unlimited page height, Excel reports '$fit_tall'"
echo "PASS: Excel accepts the merges, hides the grid and honours the print setup"

# Putting a Table on Qualification hands the user a sort button, and a formula written as
# `Qualification!C8` means "champion" only until they press it. Moving the key to another row
# is what a sort does; the Scorecard must follow the key, not the address.
#
# Measured with the fixed-address form this replaced: Champion read 4.0, then 3.0 after the
# swap — economicBuyer's score, reported under the Champion label, with nothing to notice.
swap_result="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  set wb to workbook "$BOOK"
  set sc to worksheet "Scorecard" of wb
  set q to worksheet "Qualification" of wb
  set champRow to 0
  repeat with r from 1 to 60
    if ((get value of cell ("A" & r) of sc) as string) is "Champion" then set champRow to r
  end repeat
  if champRow is 0 then return "NO-CHAMPION-ROW"
  set nameA to (get value of cell "A3" of q) as string
  set nameB to (get value of cell "A8" of q) as string
  set scoreA to (get value of cell "C3" of q)
  set scoreB to (get value of cell "C8" of q)
  set wasVal to (get value of cell ("B" & champRow) of sc) as string
  set value of range "A3" of q to nameB
  set value of range "C3" of q to scoreB
  set value of range "A8" of q to nameA
  set value of range "C8" of q to scoreA
  set nowVal to (get value of cell ("B" & champRow) of sc) as string
  return wasVal & "|" & nowVal
end tell
OSA
)"
was_champ="${swap_result%%|*}"
now_champ="${swap_result##*|}"
echo "    Champion score before moving its row = $was_champ, after = $now_champ"
[ -n "$was_champ" ] && [ "$was_champ" = "$now_champ" ] || fail "a keyed reference did not follow its key ($swap_result)"
echo "PASS: keyed references follow the key, so sorting the table cannot mislabel a score"

osascript -e "tell application \"Microsoft Excel\" to close workbook \"$BOOK\" saving no" >/dev/null 2>&1

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

# A row typed UNDER the table, which is how an Excel Table grows.
#
# The reader derives a path for such a row from the table's geometry, and only real Excel can show
# that the row it creates when you type below the last one is a row the reader then finds. The unit
# tests inject the cell into the XML themselves; Excel decides where it actually lands, whether the
# Table absorbs it, and what it looks like afterwards.
#
# The padded rows have to be FULL for this: a list of four items with twelve padded rows would leave
# holes, and appending is refused for exactly that reason. So the fixture fills every one.
GROWN_DEAL="$WORK/grown.json"
jq '
  .stakeholders = [range(12) | {name: ("Person " + (.+1|tostring)), title: "VP", roleInDeal: "Influencer"}]
' "$DEAL" >"$GROWN_DEAL" || fail "could not build the full-table deal"

GROWN_OUT="$WORK/grown.xlsx"
GROWN_BOOK="$(basename "$GROWN_OUT")"
bun "$PLUGIN_ROOT/engine/cli.ts" generate "$GROWN_DEAL" --out "$GROWN_OUT" >/dev/null || fail "generate failed for the grown-row case"

# Ask the plan where the table ends rather than assuming; the row below it is the one to type into.
grown_plan="$(bun "$PLUGIN_ROOT/engine/cli.ts" generate "$GROWN_DEAL" --plan)" || fail "generate --plan failed"
grown_sheet="$(jq -r 'first(.inputCells[] | select(.jsonPath | startswith("stakeholders[")) | .sheet)' <<<"$grown_plan")"
# A stakeholder needs name, title and roleInDeal — the schema requires all three — so type a whole
# one. Filling only the name leaves a deal that does not validate, which `read` rightly refuses.
col_for() {
  jq -r --arg suffix "].$1" 'first(.inputCells[] | select(.jsonPath | startswith("stakeholders[") and endswith($suffix)) | .address) | sub("[0-9]+$"; "")' <<<"$grown_plan"
}
last_row="$(jq -r '[.inputCells[] | select(.jsonPath | startswith("stakeholders[")) | .address | capture("(?<r>[0-9]+)$") | .r | tonumber] | max' <<<"$grown_plan")"
grown_row=$((last_row + 1))
grown_ref="$(col_for name)$grown_row"
echo "==> typing a stakeholder into $grown_sheet row $grown_row, one row under the table"

open -a "Microsoft Excel" "$GROWN_OUT" || fail "could not open the grown-row workbook"
for _ in $(seq 1 30); do
  if osascript -e 'tell application "Microsoft Excel" to get name of every workbook' 2>/dev/null | grep -qF "$GROWN_BOOK"; then
    break
  fi
  sleep 2
done

wait_until_ready "$GROWN_BOOK" "$grown_sheet" "$(col_for name)$last_row" ||
  fail "Excel never finished opening $GROWN_BOOK"
excel_do "the grown stakeholder row" "  set wb to workbook \"$GROWN_BOOK\"
  set value of range \"$(col_for name)$grown_row\" of worksheet \"$grown_sheet\" of wb to \"Dana Reyes\"
  set value of range \"$(col_for title)$grown_row\" of worksheet \"$grown_sheet\" of wb to \"VP Platform\"
  set value of range \"$(col_for roleInDeal)$grown_row\" of worksheet \"$grown_sheet\" of wb to \"Influencer\"
  save wb
  close wb saving no"

grown_report="$(bun "$PLUGIN_ROOT/engine/cli.ts" read "$GROWN_OUT" --deal "$GROWN_DEAL")"
grown_code=$?
echo "    proposals: $(jq -c '[.proposals[] | {jsonPath, to}]' <<<"$grown_report")"
[ "$grown_code" = "0" ] || fail "read exited $grown_code on the grown row: $(jq -c '.rejections' <<<"$grown_report")"
[ "$(jq -r '.rejections | length' <<<"$grown_report")" = "0" ] || fail "the grown row was rejected: $(jq -c '.rejections' <<<"$grown_report")"
[ "$(jq -r '.proposals | length' <<<"$grown_report")" = "3" ] || fail "expected 3 proposals for the grown row"
[ "$(jq -r '[.proposals[].jsonPath] | sort | join(",")' <<<"$grown_report")" = "stakeholders[12].name,stakeholders[12].roleInDeal,stakeholders[12].title" ] || fail "the grown row mapped to $(jq -c '[.proposals[].jsonPath]' <<<"$grown_report")"
[ "$(jq -r '.valid' <<<"$grown_report")" = "true" ] || fail "the deal with the appended stakeholder does not validate"

bun "$PLUGIN_ROOT/engine/cli.ts" read "$GROWN_OUT" --deal "$GROWN_DEAL" --apply >/dev/null || fail "applying the grown row failed"
grown_count="$(jq -r '.stakeholders | length' "$GROWN_DEAL")"
grown_name="$(jq -r '.stakeholders[12].name' "$GROWN_DEAL")"
grown_role="$(jq -r '.stakeholders[12].roleInDeal' "$GROWN_DEAL")"
echo "    stakeholders after applying: $grown_count, last = $grown_name"
[ "$grown_count" = "13" ] || fail "expected 13 stakeholders after applying, got $grown_count"
[ "$grown_name" = "Dana Reyes" ] || fail "the appended stakeholder is '$grown_name'"
[ "$grown_role" = "Influencer" ] || fail "the appended stakeholder's role is '$grown_role'"
bun "$PLUGIN_ROOT/engine/cli.ts" validate "$GROWN_DEAL" >/dev/null || fail "the deal does not validate after appending a grown row"
echo "PASS: a row typed under the table in Excel becomes a new list entry"

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

got_partial_raw="$(
  osascript <<OSA 2>/dev/null
tell application "Microsoft Excel"
  repeat with r from 1 to 60
    set a to (get value of cell ("A" & r) of worksheet "Scorecard" of workbook "$PARTIAL_BOOK")
    if (a as string) is "Overall score" then
      return (get value of cell ("B" & r) of worksheet "Scorecard" of workbook "$PARTIAL_BOOK") as string
    end if
  end repeat
  return "NOT-FOUND"
end tell
OSA
)"
got_partial="$(awk -v v="$got_partial_raw" 'BEGIN { printf "%.1f", v * 100 }')"
echo "    partly-qualified overall score: Excel=$got_partial% engine=$want_partial_pct%"
osascript -e "tell application \"Microsoft Excel\" to close workbook \"$PARTIAL_BOOK\" saving no" >/dev/null 2>&1
[ "$got_partial" = "$want_partial_pct" ] || fail "Excel showed $got_partial% for a partly-qualified deal, engine says $want_partial_pct%"

rm -rf "$WORK"
echo "PASS: a partly-qualified deal reads the same in Excel as in the engine"
