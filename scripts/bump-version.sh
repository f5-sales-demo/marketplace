#!/usr/bin/env bash
# Bump the version of one or all marketplace plugins.
# Updates both marketplace.json and the plugin's plugin.json in sync.
#
# Usage:
#   ./scripts/bump-version.sh <plugin-name> <major|minor|patch>
#   ./scripts/bump-version.sh --all <major|minor|patch>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"

# ── Helpers ──────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage:
  $(basename "$0") <plugin-name> <major|minor|patch>
  $(basename "$0") --all <major|minor|patch>

Examples:
  $(basename "$0") f5xc-brand patch        # 1.0.0 → 1.0.1
  $(basename "$0") f5xc-brand minor        # 1.0.0 → 1.1.0
  $(basename "$0") --all major             # bump every plugin
EOF
  exit 1
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

bump_semver() {
  local version="$1" level="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<<"$version"
  case "$level" in
  major)
    major=$((major + 1))
    minor=0
    patch=0
    ;;
  minor)
    minor=$((minor + 1))
    patch=0
    ;;
  patch) patch=$((patch + 1)) ;;
  esac
  echo "${major}.${minor}.${patch}"
}

is_valid_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# ── Argument parsing ─────────────────────────────────────────

[[ $# -lt 2 ]] && usage

BUMP_ALL=false
PLUGIN_NAME=""
LEVEL=""

if [[ "$1" == "--all" ]]; then
  BUMP_ALL=true
  LEVEL="$2"
else
  PLUGIN_NAME="$1"
  LEVEL="$2"
fi

case "$LEVEL" in
major | minor | patch) ;;
*) die "Invalid semver level '$LEVEL'. Must be major, minor, or patch." ;;
esac

[[ -f "$MARKETPLACE" ]] || die "marketplace.json not found at $MARKETPLACE"

# ── Build plugin list ────────────────────────────────────────

if [[ "$BUMP_ALL" == true ]]; then
  mapfile -t PLUGINS < <(jq -r '.plugins[].name' "$MARKETPLACE")
else
  # Verify plugin exists
  EXISTS=$(jq -r --arg name "$PLUGIN_NAME" '.plugins[] | select(.name == $name) | .name' "$MARKETPLACE")
  [[ -n "$EXISTS" ]] || die "Plugin '$PLUGIN_NAME' not found in marketplace.json"
  PLUGINS=("$PLUGIN_NAME")
fi

# ── Bump each plugin ────────────────────────────────────────

CHANGELOG_ENTRIES=()

for name in "${PLUGINS[@]}"; do
  OLD_VER=$(jq -r --arg n "$name" '.plugins[] | select(.name == $n) | .version' "$MARKETPLACE")
  is_valid_semver "$OLD_VER" || die "Plugin '$name' has invalid current version: '$OLD_VER'"

  NEW_VER=$(bump_semver "$OLD_VER" "$LEVEL")

  # Update marketplace.json
  jq --arg n "$name" --arg v "$NEW_VER" \
    '(.plugins[] | select(.name == $n)).version = $v' \
    "$MARKETPLACE" >"$MARKETPLACE.tmp" && command mv "$MARKETPLACE.tmp" "$MARKETPLACE"

  # Update plugin.json
  PLUGIN_JSON="$REPO_ROOT/plugins/$name/.claude-plugin/plugin.json"
  [[ -f "$PLUGIN_JSON" ]] || die "plugin.json not found at $PLUGIN_JSON"

  jq --arg v "$NEW_VER" '.version = $v' \
    "$PLUGIN_JSON" >"$PLUGIN_JSON.tmp" && command mv "$PLUGIN_JSON.tmp" "$PLUGIN_JSON"

  echo "  $name: $OLD_VER → $NEW_VER"
  CHANGELOG_ENTRIES+=("- **$name** bumped to v$NEW_VER")
done

# ── Update CHANGELOG.md ─────────────────────────────────────

CHANGELOG="$REPO_ROOT/CHANGELOG.md"
if [[ -f "$CHANGELOG" ]]; then
  # Build the insertion block
  INSERT=""
  for entry in "${CHANGELOG_ENTRIES[@]}"; do
    INSERT="${INSERT}\n${entry}"
  done

  # Insert after the ## [Unreleased] line
  sed -i "s/^## \[Unreleased\]$/\0\n${INSERT}/" "$CHANGELOG"
  echo ""
  echo "Updated CHANGELOG.md — edit the entries before committing."
fi

echo ""
echo "Done. Files modified:"
echo "  .claude-plugin/marketplace.json"
for name in "${PLUGINS[@]}"; do
  echo "  plugins/$name/.claude-plugin/plugin.json"
done
[[ -f "$CHANGELOG" ]] && echo "  CHANGELOG.md"
