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

MANIFEST=".xcsh-plugin/marketplace.json"

if [ "$#" -ne 0 ] && [ "$#" -ne 2 ]; then
  echo "usage: release-history.sh [<plugin> <version>]" >&2
  exit 1
fi

WANT_NAME="${1:-}"
WANT_VERSION="${2:-}"

# A shallow clone answers `git log` with a handful of commits and no error. An audit built
# on that finds nothing missing and passes — green, and blind. Refuse instead: a checkout
# that cannot see the history cannot make a claim about it.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo unknown)" != "false" ]; then
  echo "release-history.sh: refusing to read a shallow repository — the history would be" >&2
  echo "  silently short and every conclusion drawn from it wrong. Check out with" >&2
  echo "  fetch-depth: 0 (actions/checkout) or run 'git fetch --unshallow'." >&2
  exit 1
fi

# The name/version pairs recorded at one commit, one per line. A commit from before the
# manifest existed, or one whose manifest cannot be parsed, contributes nothing rather than
# aborting the walk: old history is not something a release today can fix.
versions_at() {
  git show "${1}:${MANIFEST}" 2>/dev/null |
    jq -r '.plugins[]? | select(.name != null and .version != null) | "\(.name) \(.version)"' 2>/dev/null ||
    true
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
  parent_set="${NL}$(versions_at "${sha}^")${NL}"
  while read -r name version; do
    [ -n "$name" ] || continue
    key="${name} ${version}"
    # Already published by an earlier commit: a version can carry only one tag, so a
    # version that reappears (after a downgrade, or a revert) is not a second release.
    case "$SEEN" in
    *"${NL}${key}${NL}"*) continue ;;
    esac
    # Unchanged from the parent: this commit edited the manifest, not this version.
    case "$parent_set" in
    *"${NL}${key}${NL}"*) continue ;;
    esac
    SEEN="${SEEN}${key}${NL}"
    if [ -z "$WANT_NAME" ]; then
      printf '%s %s %s\n' "$name" "$version" "$sha"
    elif [ "$name" = "$WANT_NAME" ] && [ "$version" = "$WANT_VERSION" ]; then
      FOUND_SHA="$sha"
    fi
  done <<<"$(versions_at "$sha")"
done <<<"$(git log --first-parent --reverse --format='%H' -- "$MANIFEST")"

if [ -n "$WANT_NAME" ]; then
  if [ -z "$FOUND_SHA" ]; then
    echo "release-history.sh: ${WANT_NAME} v${WANT_VERSION} was never published on this" >&2
    echo "  branch — no commit sets that version in ${MANIFEST}. Refusing to name a commit" >&2
    echo "  for a release that did not happen." >&2
    exit 1
  fi
  printf '%s\n' "$FOUND_SHA"
fi
