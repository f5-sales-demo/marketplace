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

fail() {
  echo "FAIL: $1" >&2
  osascript -e "tell application \"Microsoft Excel\" to close workbook \"$BOOK\" saving no" >/dev/null 2>&1
  exit 1
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
