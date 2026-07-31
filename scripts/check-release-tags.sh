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

MISSING=0
CHECKED=0
while read -r name version sha; do
  [ -n "$name" ] || continue
  # A version published by the tip commit is still being released: the release job runs
  # alongside whatever triggered this audit, so demanding its tag would fail every
  # legitimate release. One commit later, the same gap is real and gets reported.
  if [ "$sha" = "$TIP" ]; then
    echo "in flight: ${name} v${version} published by the tip commit; its release has not finished"
    continue
  fi
  CHECKED=$((CHECKED + 1))
  if git rev-parse -q --verify "refs/tags/${name}/v${version}" >/dev/null; then
    continue
  fi
  MISSING=1
  echo "::error::No tag ${name}/v${version} — that version was published by ${sha} and never" \
    "released. Re-cut it: gh workflow run 'Release Plugins' -f plugin=${name} -f version=${version}"
done <<<"$HISTORY"

if [ "$MISSING" -ne 0 ]; then
  echo "check-release-tags.sh: published versions are missing their tags (see above)." >&2
  exit 1
fi

# Say what was checked. "0 versions, no problems found" is not a pass, and a silent exit 0
# reads identically to one.
echo "check-release-tags.sh: ${CHECKED} published plugin version(s) all carry their tags."
