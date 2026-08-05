#!/usr/bin/env bash
# Hermetic test for the CHANGELOG side of scripts/bump-version.sh — the entry that
# becomes a published release note.
#
# Builds throwaway repositories, so it never inspects the repository it lives in.
# No network.
#
# What this guards: a pull request with N commits touching one plugin runs the bump N
# times, and the squash-merge publishes ONE release. Appending a line per run therefore
# ships a release whose notes list versions that were never released — which reached
# production once already (salesforce/v1.3.5 shipped notes for a v1.3.4 that has no tag).
# Repeated bumps must converge on one entry at the current version.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRIPT="${REPO_ROOT}/scripts/bump-version.sh"

FAIL=0
WORK=$(mktemp -d)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# A minimal repository with one plugin at 1.0.0 and an empty [Unreleased] section.
new_repo() {
  local dir="${WORK}/$1"
  mkdir -p "$dir/.xcsh-plugin" "$dir/plugins/demo/.xcsh-plugin"
  git -C "$dir" init -q -b main 2>/dev/null
  git -C "$dir" config user.email bump@test
  git -C "$dir" config user.name "Bump Test"
  cat >"$dir/.xcsh-plugin/marketplace.json" <<'JSON'
{ "plugins": [{ "name": "demo", "version": "1.0.0" }] }
JSON
  cat >"$dir/plugins/demo/.xcsh-plugin/plugin.json" <<'JSON'
{ "name": "demo", "version": "1.0.0" }
JSON
  cat >"$dir/CHANGELOG.md" <<'MD'
# Changelog

## [Unreleased]

## [0.9.0]

- **`demo`** bumped to v0.9.0
MD
  echo "$dir"
}

# REPO_ROOT points the script at the throwaway repository. Without it the script derives
# its root from its own path and would bump the checkout under test.
bump() {
  (cd "$1" && REPO_ROOT="$1" bash "$SCRIPT" demo patch) >/dev/null 2>&1
}

# Lines the release workflow would read: those between the first two "## [" headings,
# capped at 20, mentioning the plugin. Mirrors release-plugins.yml exactly.
release_lines() {
  python3 - "$1" <<'PY'
import sys
lines = open(sys.argv[1] + '/CHANGELOG.md').read().split('\n')
idx = [i for i, l in enumerate(lines) if l.startswith('## [')]
for l in lines[idx[0] + 1:idx[1]][:20]:
    if 'demo' in l.lower():
        print(l)
PY
}

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "[OK] $label"
  else
    echo "[FAIL] $label"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    FAIL=1
  fi
}

# ── One bump produces exactly one entry ─────────────────────
repo=$(new_repo single)
bump "$repo"
check "one bump -> one entry" \
  "- **\`demo\`** bumped to v1.0.1" \
  "$(release_lines "$repo")"

# ── Repeated bumps converge rather than accumulate ──────────
repo=$(new_repo repeated)
bump "$repo"
bump "$repo"
bump "$repo"
check "three bumps -> one entry, at the final version" \
  "- **\`demo\`** bumped to v1.0.3" \
  "$(release_lines "$repo")"

version=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['plugins'][0]['version'])" \
  "$repo/.xcsh-plugin/marketplace.json")
check "manifest agrees with the entry" "1.0.3" "$version"

# ── A hand-written prose entry is adopted, not duplicated ───
# Contributors replace the placeholder with real prose. A later bump on the same branch
# must relabel that prose, not bury it under a fresh placeholder — this is exactly how
# the salesforce v1.3.4/v1.3.5 mismatch was produced.
repo=$(new_repo prose)
bump "$repo"
python3 - "$repo" <<'PY'
import sys
p = sys.argv[1] + '/CHANGELOG.md'
s = open(p).read().replace(
    '- **`demo`** bumped to v1.0.1',
    '- **`demo`** v1.0.1 — did a real thing worth describing.')
open(p, 'w').write(s)
PY
bump "$repo"
check "prose entry is relabelled, not duplicated" \
  "- **\`demo\`** v1.0.2 — did a real thing worth describing." \
  "$(release_lines "$repo")"

# ── A shipped release's prose is never reattributed ─────────
# This repository leaves entries for published releases under [Unreleased]. Relabelling one
# would silently move a shipped description onto the version being cut and destroy the real
# note — observed: three bumps rewrote "v1.3.5 — schema is discovered at runtime" to v1.3.8.
repo=$(new_repo released_prose)
python3 - "$repo" <<'PY'
import sys
p = sys.argv[1] + '/CHANGELOG.md'
s = open(p).read().replace(
    '## [Unreleased]\n',
    '## [Unreleased]\n\n- **`demo`** v1.0.0 — shipped, and tagged, months ago.\n')
open(p, 'w').write(s)
PY
git -C "$repo" add -A >/dev/null 2>&1
git -C "$repo" commit -qm baseline >/dev/null 2>&1
git -C "$repo" tag "demo/v1.0.0"
bump "$repo"
check "a tagged version's prose is left intact" \
  "$(printf -- '- **`demo`** bumped to v1.0.1\n- **`demo`** v1.0.0 — shipped, and tagged, months ago.')" \
  "$(release_lines "$repo")"

# Untagged prose is still the current branch's work, so it is relabelled as before.
repo=$(new_repo untagged_prose)
bump "$repo"
python3 - "$repo" <<'PY'
import sys
p = sys.argv[1] + '/CHANGELOG.md'
s = open(p).read().replace(
    '- **`demo`** bumped to v1.0.1',
    '- **`demo`** v1.0.1 — written on this branch, not released yet.')
open(p, 'w').write(s)
PY
bump "$repo"
check "untagged prose is still relabelled" \
  "- **\`demo\`** v1.0.2 — written on this branch, not released yet." \
  "$(release_lines "$repo")"

# ── Entries from earlier releases are left alone ────────────
repo=$(new_repo history)
bump "$repo"
older=$(grep -c -- '- \*\*`demo`\*\* bumped to v0.9.0' "$repo/CHANGELOG.md")
check "the released 0.9.0 entry survives untouched" "1" "$older"

if [ "$FAIL" -ne 0 ]; then
  echo "bump-version changelog tests FAILED"
  exit 1
fi
echo "bump-version changelog tests passed"
