#!/usr/bin/env bash
# release-notes.sh — select the CHANGELOG entry for the plugin version being tagged.
#
# Usage: release-notes.sh <plugin-name> <version> [changelog-path]
#
# Prints the release body on stdout. Exits non-zero, with the reason on stderr, when the
# changelog cannot be trusted to describe this release.
#
# Why it refuses rather than guessing: the previous inline version matched on plugin name
# alone and published whatever came back. salesforce/v1.3.5 shipped with three lines — two
# stale placeholders and an entry for a v1.3.4 that was never tagged. A release note naming
# a version nobody can install is worse than no note, and it is invisible after the fact,
# so ambiguity has to fail the build instead of reaching the release page.
#
# Lives here rather than inline in release-plugins.yml so it can be tested; untestable
# bash embedded in YAML is how the original defect survived review.
set -euo pipefail

NAME="${1:?usage: release-notes.sh <plugin-name> <version> [changelog]}"
VERSION="${2:?usage: release-notes.sh <plugin-name> <version> [changelog]}"
CHANGELOG="${3:-CHANGELOG.md}"

# Escape regex metacharacters. Version strings contain dots, which would otherwise match
# any character — "1.3.5" would accept "1x3x5". Plugin names are identifiers today, but
# nothing in the schema forbids a metacharacter, so both are escaped.
escape_re() { printf '%s' "$1" | sed 's/[][\.*^$(){}?+|/\\]/\\&/g'; }

NAME_RE=$(escape_re "$NAME")
VERSION_RE=$(escape_re "$VERSION")

# The [Unreleased] section: lines between the first two "## [" headings.
#
# awk, not `sed -n '/^## \[/,/^## \[/{//!p}'`. That sed form is a GNU extension and BSD sed
# rejects it outright, so the workflow's copy worked in CI and could not be reproduced on a
# maintainer's macOS checkout — which is part of why the release-note defect went unnoticed.
unreleased_section() {
  awk '
    /^## \[/ { seen++; if (seen >= 2) exit; next }
    seen == 1 { print }
  ' "$CHANGELOG"
}

# An entry for this plugin at any version. Accepts the placeholder the bump script writes
# ("bumped to vX.Y.Z") and the hand-written prose that replaces it ("vX.Y.Z — ...").
ENTRY_RE="^- \\*\\*\`?${NAME_RE}\`?\\*\\* (bumped to )?v"

if [[ ! -f "$CHANGELOG" ]]; then
  printf 'Released **%s** v%s\n' "$NAME" "$VERSION"
  exit 0
fi

ALL=$(unreleased_section | grep -iE "${ENTRY_RE}[0-9]+\.[0-9]+\.[0-9]+" || true)

# Entries for OTHER versions are ignored, not treated as an error. This repository keeps
# every past entry under [Unreleased] rather than moving them beneath a released heading,
# so older versions of a plugin are always present and legitimately so — rejecting them
# would block every future release. Anchoring to the exact version is what fixes the
# original defect: the old selection matched on plugin name and swept the neighbours in.
MATCHING=$(printf '%s\n' "$ALL" | grep -iE "${ENTRY_RE}${VERSION_RE}([^0-9]|$)" || true)

COUNT=$(printf '%s\n' "$MATCHING" | grep -c . || true)

if [[ "$COUNT" -eq 0 ]]; then
  # No note for this exact version — including the case where the plugin has entries for
  # other versions only. Not an error: a plugin may be released without a changelog note,
  # and inventing one from a neighbouring version is the defect this script exists to stop.
  printf 'Released **%s** v%s\n' "$NAME" "$VERSION"
  exit 0
fi

if [[ "$COUNT" -gt 1 ]]; then
  {
    echo "release-notes: ${COUNT} [Unreleased] entries for '${NAME}' v${VERSION};"
    echo "               refusing to publish an ambiguous release note."
    printf '%s\n' "$MATCHING" | sed 's/^/               /'
  } >&2
  exit 1
fi

# Emit the whole entry, not just its first line.
#
# A changelog entry here is a block: the "- **`name`** vX.Y.Z …" line, then indented
# continuation paragraphs and nested bullets, ending at the next top-level "- " entry.
# Selecting with a line-oriented grep published only the summary line, so every release
# note this workflow ever cut was a sentence truncated mid-clause.
#
# The leading "- " is stripped and continuations dedented by two, so the note reads as
# prose on the release page instead of one oversized list item; nested bullets keep their
# relative depth. Trailing blank lines are dropped.
# Reads to EOF rather than exiting at the end of the entry.
#
# `exit` here was a reader quitting on a writer still writing. Below the 64 KiB pipe buffer the
# writer finishes first and nothing notices; above it the writer blocks, takes SIGPIPE when awk
# leaves, and `pipefail` makes 141 the status of a script that just printed the correct note. The
# workflow read that as an ambiguous changelog and refused to publish, which is why meddpicc/v7.2.0
# was merged and never tagged.
#
# `done` stops the emitting; the input is consumed either way. Reading a few spare kilobytes costs
# nothing next to guessing whether the other end of a pipe has finished.
unreleased_section | awk -v start="$MATCHING" '
  index($0, start) == 1 && !started { started = 1; print substr($0, 3); next }
  started && !done {
    # A new top-level list item, or any unindented line, ends this entry.
    if ($0 ~ /^- /) { done = 1; next }
    if ($0 ~ /^[^ \t]/ && $0 != "") { done = 1; next }
    if ($0 == "") { blanks++; next }
    while (blanks > 0) { print ""; blanks-- }
    print substr($0, 3)
  }
'
