#!/usr/bin/env bash
# release-history.sh — which commit published which plugin version.
#
# Usage:
#   release-history.sh                     # "<plugin> <version> <sha>" per release, oldest first
#   release-history.sh <plugin> <version>  # the sha that published it; exit 1 if it never was
#
# A plugin version is "published" by the commit that first set it in
# .xcsh-plugin/marketplace.json on the mainline. That commit — not whatever main happens to
# be later — is what a tag should point at, and it is the only evidence that a version
# asked for by hand was ever really on main.
#
# Lives here rather than inline in release-plugins.yml so it can be tested. The release
# path already learned that lesson once: the note selection was untestable bash in YAML and
# published salesforce/v1.3.5 with notes for a version that has no tag (see release-notes.sh).
set -euo pipefail

# Every path the marketplace manifest has ever lived at, newest first. The rename in
# e4723c3 (.claude-plugin → .xcsh-plugin) is not cosmetic here: a log limited to the current
# path stops at the rename, hiding 57 commits of release history and attributing all 29
# versions that existed at the time to the refactor that moved the file. A re-cut would then
# tag the rename instead of the release. Add to this list, never replace it.
MANIFEST_PATHS=(".xcsh-plugin/marketplace.json" ".claude-plugin/marketplace.json")
MANIFEST="${MANIFEST_PATHS[0]}"

if [ "$#" -ne 0 ] && [ "$#" -ne 2 ]; then
  echo "usage: release-history.sh [<plugin> <version>]" >&2
  exit 1
fi

WANT_NAME="${1:-}"
WANT_VERSION="${2:-}"

# A shallow clone answers `git log` with a handful of commits and no error. An audit built
# on that finds nothing missing and passes — green, and blind. Refuse instead: a checkout
# that cannot see the history cannot make a claim about it.
if [ "$(git rev-parse --is-shallow-repository 2> /dev/null || echo unknown)" != "false" ]; then
  echo "release-history.sh: refusing to read a shallow repository — the history would be" >&2
  echo "  silently short and every conclusion drawn from it wrong. Check out with" >&2
  echo "  fetch-depth: 0 (actions/checkout) or run 'git fetch --unshallow'." >&2
  exit 1
fi

# The name/version pairs recorded at one commit, one per line. A commit from before the
# manifest existed, or one whose manifest cannot be parsed, contributes nothing rather than
# aborting the walk: old history is not something a release today can fix.
# Reads whichever manifest path exists at that commit, preferring the current one.
versions_at() {
  local ref="$1" path raw
  for path in "${MANIFEST_PATHS[@]}"; do
    raw=$(git show "${ref}:${path}" 2> /dev/null) || continue
    [ -n "$raw" ] || continue
    printf '%s' "$raw" |
      jq -r '.plugins[]? | select(.name != null and .version != null) | "\(.name) \(.version)"' 2> /dev/null ||
      true
    return 0
  done
}

# --first-parent follows what landed on main, so a version that only ever existed on a
# side branch is not treated as published.
#
# SEEN is a newline-delimited list, not an associative array: macOS ships bash 3.2, where
# `declare -A` is a syntax error. CI runs bash 5 and would never have said so — the same
# split that made the old GNU-only sed in the note selection work in CI and fail on a
# maintainer's checkout. A hundred-odd releases make the linear scan free.
#
# Both membership tests are in-shell rather than `grep`. Spawning two greps per plugin per
# commit cost 42 seconds of the 45 this took on the real history, and this runs on every
# push to main. The newline sentinels around each key are what keep the substring test
# honest: an unanchored match would let "demo 1.0" satisfy "demo 1.0.1".
NL=$'\n'
SEEN="$NL"
FOUND_SHA=""

while read -r sha; do
  [ -n "$sha" ] || continue
  while read -r name version; do
    [ -n "$name" ] || continue
    key="${name} ${version}"
    # First sighting anywhere on the mainline is the release. Everything else follows from
    # that one rule: a commit that edits the manifest without changing this version is
    # skipped because the version is already seen, and so is a version that reappears after
    # a downgrade or a revert — it can only ever carry one tag.
    #
    # An earlier draft also compared against the parent commit's set, mirroring the
    # HEAD-vs-HEAD~1 diff the release workflow does. That is the right rule for the
    # workflow, which sees two commits; here it was unreachable, and a mutation test proved
    # it by deleting the comparison without failing anything.
    case "$SEEN" in
    *"${NL}${key}${NL}"*) continue ;;
    esac
    SEEN="${SEEN}${key}${NL}"
    if [ -z "$WANT_NAME" ]; then
      printf '%s %s %s\n' "$name" "$version" "$sha"
    elif [ "$name" = "$WANT_NAME" ] && [ "$version" = "$WANT_VERSION" ]; then
      FOUND_SHA="$sha"
    fi
  done <<< "$(versions_at "$sha")"
done <<< "$(git log --first-parent --reverse --format='%H' -- "${MANIFEST_PATHS[@]}")"

if [ -n "$WANT_NAME" ]; then
  if [ -z "$FOUND_SHA" ]; then
    echo "release-history.sh: ${WANT_NAME} v${WANT_VERSION} was never published on this" >&2
    echo "  branch — no commit sets that version in ${MANIFEST}. Refusing to name a commit" >&2
    echo "  for a release that did not happen." >&2
    exit 1
  fi
  printf '%s\n' "$FOUND_SHA"
fi
