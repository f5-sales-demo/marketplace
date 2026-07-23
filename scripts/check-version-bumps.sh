#!/usr/bin/env bash
# check-version-bumps.sh — CI gate.
#
# Fails when a plugin's CONTENT changed versus BASE_REF but its version was not bumped,
# so plugin changes can never merge unreleased (release-plugins.yml only tags a plugin
# whose marketplace.json version changed). Enforcement is here in CI, independent of
# whether a contributor installed the local auto-bump pre-commit hook.
#
# Mirrors the bump-eligibility logic in scripts/auto-bump-version.sh: version/metadata
# files do not count as content, and brand-new plugins (no version at BASE) are skipped.
#
# Usage: check-version-bumps.sh <base-ref>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_REF="${1:-}"
[[ -n "$BASE_REF" ]] || {
  echo "usage: $(basename "$0") <base-ref>" >&2
  exit 2
}

# Files that do NOT count as "content" for bump-eligibility (they ARE the bump, or are
# repo-level release bookkeeping).
is_version_file() {
  case "$1" in
  plugins/*/.xcsh-plugin/plugin.json) return 0 ;;
  .xcsh-plugin/marketplace.json) return 0 ;;
  CHANGELOG.md) return 0 ;;
  *) return 1 ;;
  esac
}

# Collect plugins that have non-version content changes vs the base.
declare -a CHANGED_PLUGINS=()
SEEN=""
while IFS= read -r f; do
  [[ "$f" =~ ^plugins/([^/]+)/ ]] || continue
  is_version_file "$f" && continue
  p="${BASH_REMATCH[1]}"
  [[ " $SEEN " == *" $p "* ]] && continue
  CHANGED_PLUGINS+=("$p")
  SEEN="$SEEN $p"
done < <(git -C "$REPO_ROOT" diff --name-only "$BASE_REF" HEAD)

if [[ ${#CHANGED_PLUGINS[@]} -eq 0 ]]; then
  echo "check-version-bumps: no plugin content changes — OK"
  exit 0
fi

FAILED=0
for p in "${CHANGED_PLUGINS[@]}"; do
  rel="plugins/$p/.xcsh-plugin/plugin.json"

  # New plugin (no version at base) — initial version is set manually; skip.
  base_ver=$(git -C "$REPO_ROOT" show "$BASE_REF:$rel" 2>/dev/null | jq -r '.version // empty') || base_ver=""
  if [[ -z "$base_ver" ]]; then
    echo "check-version-bumps: '$p' is new (no version at base) — skipping"
    continue
  fi

  # Removed/renamed plugin — plugin.json is gone at HEAD; nothing to bump. Skip so
  # legitimate deletion/rename PRs are not blocked by an unsatisfiable version check.
  if [[ ! -f "$REPO_ROOT/$rel" ]]; then
    echo "check-version-bumps: '$p' removed at HEAD — skipping"
    continue
  fi

  head_ver=$(jq -r '.version // empty' "$REPO_ROOT/$rel" 2>/dev/null) || head_ver=""
  if [[ -z "$head_ver" ]]; then
    echo "::error::Plugin '$p' is missing $rel .version"
    FAILED=1
    continue
  fi

  if [[ "$head_ver" == "$base_ver" ]]; then
    echo "::error::Plugin '$p' changed content but its version was not bumped (still $base_ver). Run: scripts/bump-version.sh $p <patch|minor|major>"
    FAILED=1
  else
    echo "check-version-bumps: '$p' bumped $base_ver → $head_ver ✓"
  fi
done

if [[ $FAILED -ne 0 ]]; then
  exit 1
fi
echo "check-version-bumps: OK"
