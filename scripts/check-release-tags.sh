#!/usr/bin/env bash
# check-release-tags.sh — every plugin version ever published on main must carry its tag.
#
# Usage: check-release-tags.sh
#
# The gap this closes is a quiet one. When `Release Plugins` fails for a reason outside the
# release itself — meddpicc/v7.2.0 died on a SIGPIPE in the note script — nothing downstream
# disagrees: main is green, the version files say 7.2.0, the changelog says 7.2.0, and only
# the absent tag knows. The next version then bumps past it and the gap is invisible for
# good, because a check against the current manifest alone would only ever ask about the
# newest version.
#
# So this walks the whole published history, not just the manifest at HEAD.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)

# release-history.sh refuses a shallow clone; let that refusal through rather than
# reporting "nothing missing" from a history this checkout cannot see.
if ! HISTORY=$("${HERE}/release-history.sh"); then
  echo "check-release-tags.sh: cannot read the release history (see above); refusing to" >&2
  echo "  report on tags it could not check." >&2
  exit 1
fi

TIP=$(git rev-parse HEAD)

# Plugins the marketplace currently offers. A plugin that has been withdrawn or renamed
# away cannot be installed, so a missing tag for it names no release anyone can cut — the
# five f5xc-* v1.0.0 entries left behind by the org rename would otherwise hold main red
# for good. Every version of a plugin still on offer stays in scope, which is what keeps a
# meddpicc/v7.2.0-shaped gap reportable.
CURRENT=""
for path in .xcsh-plugin/marketplace.json .claude-plugin/marketplace.json; do
  if [ -f "$path" ]; then
    CURRENT=$(jq -r '.plugins[]?.name // empty' "$path")
    break
  fi
done
if [ -z "$CURRENT" ]; then
  echo "check-release-tags.sh: no marketplace manifest found, or it lists no plugins;" >&2
  echo "  refusing to report every published version as out of scope." >&2
  exit 1
fi

MISSING=0
CHECKED=0
WITHDRAWN=0
while read -r name version sha; do
  [ -n "$name" ] || continue
  if ! printf '%s\n' "$CURRENT" | grep -qxF "$name"; then
    WITHDRAWN=$((WITHDRAWN + 1))
    continue
  fi
  # A version published by the tip commit is still being released: the release job runs
  # alongside whatever triggered this audit, so demanding its tag would fail every
  # legitimate release. One commit later, the same gap is real and gets reported.
  if [ "$sha" = "$TIP" ]; then
    echo "in flight: ${name} v${version} published by the tip commit; its release has not finished"
    continue
  fi
  CHECKED=$((CHECKED + 1))
  # ^{commit} dereferences an annotated tag to the commit it wraps; a lightweight tag is
  # already one. Without it the two sides of the comparison are different kinds of object
  # and an annotated tag would never match.
  if ! tagged=$(git rev-parse -q --verify "refs/tags/${name}/v${version}^{commit}"); then
    MISSING=1
    echo "::error::No tag ${name}/v${version} — that version was published by ${sha} and never" \
      "released. Re-cut it: gh workflow run 'Release Plugins' -f plugin=${name} -f version=${version}"
    continue
  fi
  # An existing tag on the wrong commit is worse than a missing one: it reads as released
  # while shipping a different revision than the version claims.
  if [ "$tagged" != "$sha" ]; then
    MISSING=1
    echo "::error::Tag ${name}/v${version} points at ${tagged}, but that version was published" \
      "by ${sha}. Whoever installs it gets a different revision than the version names."
  fi
done <<<"$HISTORY"

if [ "$MISSING" -ne 0 ]; then
  echo "check-release-tags.sh: published versions are missing their tags (see above)." >&2
  exit 1
fi

# Say what was checked, and what was deliberately not. "0 versions, no problems found" is
# not a pass, and a silent exit 0 reads identically to one.
echo "check-release-tags.sh: ${CHECKED} published plugin version(s) all carry their tags;" \
  "${WITHDRAWN} belonging to plugins no longer offered were out of scope."
