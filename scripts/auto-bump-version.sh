#!/usr/bin/env bash
# auto-bump-version.sh — pre-commit hook: automatically patch-bump plugins
# whose content files are staged, unless already manually bumped.
#
# Called by pre-commit framework; never receives filenames (pass_filenames: false).
# Must exit 0 — we add files; we never block the commit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"

# Version files to exclude from "content changed" detection.
# A plugin is only eligible for auto-bump if it has staged files BEYOND these.
is_version_file() {
  local file="$1"
  case "$file" in
  plugins/*/.claude-plugin/plugin.json) return 0 ;;
  .claude-plugin/marketplace.json) return 0 ;;
  CHANGELOG.md) return 0 ;;
  *) return 1 ;;
  esac
}

# Collect staged plugins that have non-version file changes.
# bash 3.2 compatible: no mapfile, uses SEEN string for deduplication.
declare -a STAGED_PLUGINS=()
SEEN=""

while IFS= read -r staged_file; do
  if [[ "$staged_file" =~ ^plugins/([^/]+)/ ]]; then
    plugin_name="${BASH_REMATCH[1]}"
    if is_version_file "$staged_file"; then
      continue
    fi
    if [[ " $SEEN " != *" $plugin_name "* ]]; then
      STAGED_PLUGINS+=("$plugin_name")
      SEEN="$SEEN $plugin_name"
    fi
  fi
done < <(git -C "$REPO_ROOT" diff --cached --name-only)

if [[ ${#STAGED_PLUGINS[@]} -eq 0 ]]; then
  exit 0
fi

for plugin_name in "${STAGED_PLUGINS[@]}"; do
  plugin_json_rel="plugins/${plugin_name}/.claude-plugin/plugin.json"
  plugin_json_abs="$REPO_ROOT/$plugin_json_rel"

  if [[ ! -f "$plugin_json_abs" ]]; then
    echo "auto-bump: skipping '$plugin_name' — plugin.json not on disk"
    continue
  fi

  # New plugin guard: no HEAD version means initial creation — skip auto-bump.
  head_version=$(git -C "$REPO_ROOT" show "HEAD:${plugin_json_rel}" 2>/dev/null |
    jq -r '.version // empty') || head_version=""

  if [[ -z "$head_version" ]]; then
    echo "auto-bump: skipping '$plugin_name' — new plugin, set initial version manually"
    continue
  fi

  # Read staged version from the git index (not working tree).
  staged_version=$(git -C "$REPO_ROOT" show ":${plugin_json_rel}" 2>/dev/null |
    jq -r '.version // empty') || staged_version=""

  if [[ -z "$staged_version" ]]; then
    # plugin.json not yet added to the index — read from working tree.
    staged_version=$(jq -r '.version // empty' "$plugin_json_abs")
  fi

  # Idempotency: if version was already manually bumped, skip.
  if [[ "$staged_version" != "$head_version" ]]; then
    echo "auto-bump: '$plugin_name' version already changed ($head_version → $staged_version), skipping"
    continue
  fi

  # Perform the patch bump via the existing script.
  echo "auto-bump: bumping '$plugin_name' patch ($head_version → patch)"
  "$REPO_ROOT/scripts/bump-version.sh" "$plugin_name" patch

  # Stage the version file changes produced by bump-version.sh.
  git -C "$REPO_ROOT" add \
    "$plugin_json_abs" \
    "$MARKETPLACE" \
    "$REPO_ROOT/CHANGELOG.md"

  echo "auto-bump: staged version files for '$plugin_name'"
done

exit 0
