#!/usr/bin/env bash
# Hermetic test for scripts/release-notes.sh — the gate between CHANGELOG.md and a
# published GitHub release body. Builds throwaway changelogs; never reads the repository
# it lives in. No network.
#
# The case that matters most is "refuses": salesforce/v1.3.5 was published with notes
# describing a v1.3.4 that has no tag, because the old inline selection matched on plugin
# name and accepted whatever it found. A wrong release note cannot be spotted after the
# fact, so the build has to stop.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRIPT="${REPO_ROOT}/scripts/release-notes.sh"

FAIL=0
WORK=$(mktemp -d)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

n=0
changelog() {
  n=$((n + 1))
  local f="${WORK}/CHANGELOG-${n}.md"
  {
    echo "# Changelog"
    echo
    echo "## [Unreleased]"
    echo
    cat
    echo
    echo "## [0.9.0]"
    echo
    echo '- **`demo`** bumped to v0.9.0'
  } >"$f"
  echo "$f"
}

assert_body() {
  local label="$1" expected="$2" file="$3" version="$4"
  local actual rc=0
  actual=$(bash "$SCRIPT" demo "$version" "$file" 2>/dev/null) || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "[FAIL] $label -> exited $rc, expected success"
    FAIL=1
  elif [ "$actual" = "$expected" ]; then
    echo "[OK] $label"
  else
    echo "[FAIL] $label"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    FAIL=1
  fi
}

assert_refuses() {
  local label="$1" file="$2" version="$3"
  local rc=0
  bash "$SCRIPT" demo "$version" "$file" >/dev/null 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "[OK] $label -> refused (exit $rc)"
  else
    echo "[FAIL] $label -> published, expected refusal"
    FAIL=1
  fi
}

# ── The happy paths ─────────────────────────────────────────
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.1
MD
)
assert_body "placeholder entry for the tagged version" \
  '**`demo`** bumped to v1.0.1' "$f" 1.0.1

# ── A multi-line entry is published whole ───────────────────
# Entries in this repository are blocks: a summary line, indented continuation paragraphs,
# and nested bullets. Selecting with a line-oriented grep published only the first line, so
# salesforce/v1.0.5 went out as a sentence cut mid-clause. The leading "- " is stripped and
# continuations dedented by two, so the body reads as prose rather than one giant list item.
MULTILINE_EXPECTED=$(
  cat <<'EXPECTED'
**`demo`** v1.0.1 — the summary line, which wraps
onto a second line.

A paragraph of cause, indented to match.

- **A nested bullet.** With its own
  continuation.
- A second nested bullet.
EXPECTED
)
f=$(
  changelog <<'MD'
- **`demo`** v1.0.1 — the summary line, which wraps
  onto a second line.

  A paragraph of cause, indented to match.

  - **A nested bullet.** With its own
    continuation.
  - A second nested bullet.

- **`other`** v2.0.0 — a different plugin entry, which must not leak in.
MD
)
assert_body "a multi-line entry is emitted whole, dedented" \
  "$MULTILINE_EXPECTED" "$f" 1.0.1

f=$(
  changelog <<'MD'
- **`demo`** v1.0.1 — describes the change in prose.
MD
)
assert_body "prose entry for the tagged version" \
  '**`demo`** v1.0.1 — describes the change in prose.' "$f" 1.0.1

f=$(
  changelog <<'MD'
- **`other`** bumped to v3.0.0
MD
)
assert_body "no entry for this plugin falls back to a generic note" \
  'Released **demo** v1.0.1' "$f" 1.0.1

# Another plugin's entry at a different version must not be mistaken for staleness.
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.1

- **`other`** v9.9.9 — unrelated plugin, unrelated version.
MD
)
assert_body "another plugin's entry is ignored" \
  '**`demo`** bumped to v1.0.1' "$f" 1.0.1

# ── Neighbouring versions are excluded, not published ───────
# Exactly the shape that shipped as salesforce/v1.3.5: a placeholder for the tagged version
# plus a prose entry labelled with a version that was never tagged. The old selection
# matched on plugin name and published both. Only the tagged version may appear.
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.2

- **`demo`** v1.0.1 — describes the change, but for the wrong version.
MD
)
assert_body "the salesforce v1.3.5 shape publishes only the tagged version" \
  '**`demo`** bumped to v1.0.2' "$f" 1.0.2

f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.3

- **`demo`** bumped to v1.0.2

- **`demo`** bumped to v1.0.1
MD
)
assert_body "accumulated placeholders yield only the tagged one" \
  '**`demo`** bumped to v1.0.3' "$f" 1.0.3

# This repository keeps entries for past releases under [Unreleased] indefinitely. Treating
# those as an error would block every future release, so they must be silently skipped.
f=$(
  changelog <<'MD'
- **`demo`** bumped to v2.0.0

- **`demo`** v1.5.0 — shipped months ago, still listed here by house style.

- **`demo`** v1.0.0 — older still.
MD
)
assert_body "historical entries under [Unreleased] do not block a release" \
  '**`demo`** bumped to v2.0.0' "$f" 2.0.0

# ── The one genuine refusal: real ambiguity ─────────────────
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.1

- **`demo`** v1.0.1 — a duplicate at the same version.
MD
)
assert_refuses "two entries at the tagged version is ambiguous" "$f" 1.0.1

# ── Version matching is exact ───────────────────────────────
# The dot in "1.0.1" must not behave as a regex wildcard.
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1x0x1
MD
)
assert_body "a dot in the version is not a wildcard" \
  'Released **demo** v1.0.1' "$f" 1.0.1

# A longer version starting with the same digits is a different release, so it must not be
# mistaken for the tagged one.
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.10
MD
)
assert_body "v1.0.10 is not mistaken for v1.0.1" \
  'Released **demo** v1.0.1' "$f" 1.0.1

# ── Earlier release sections are out of scope ───────────────
f=$(
  changelog <<'MD'
- **`demo`** bumped to v1.0.1
MD
)
assert_body "the released 0.9.0 entry below is not considered stale" \
  '**`demo`** bumped to v1.0.1' "$f" 1.0.1

if [ "$FAIL" -ne 0 ]; then
  echo "release-notes tests FAILED"
  exit 1
fi
echo "release-notes tests passed"
