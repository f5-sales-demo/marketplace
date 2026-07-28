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
OUT="$(mktemp -d)/uat-deal.xlsx"
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

read_cell() {
  osascript -e "tell application \"Microsoft Excel\" to get value of cell \"$2\" of worksheet \"$1\" of workbook \"$BOOK\"" 2>/dev/null
}

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

osascript -e "tell application \"Microsoft Excel\" to close workbook \"$BOOK\" saving no" >/dev/null 2>&1
rm -rf "$(dirname "$OUT")"
echo "PASS: Excel opened the generated workbook and its Scorecard agrees with the engine"
