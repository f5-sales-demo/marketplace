#!/usr/bin/env bash
# Bump the version of one or all marketplace plugins.
# Updates both marketplace.json and the plugin's plugin.json in sync.
#
# Usage:
#   ./scripts/bump-version.sh <plugin-name> <major|minor|patch>
#   ./scripts/bump-version.sh --all <major|minor|patch>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.xcsh-plugin/marketplace.json"

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
  PLUGIN_JSON="$REPO_ROOT/plugins/$name/.xcsh-plugin/plugin.json"
  [[ -f "$PLUGIN_JSON" ]] || die "plugin.json not found at $PLUGIN_JSON"

  jq --arg v "$NEW_VER" '.version = $v' \
    "$PLUGIN_JSON" >"$PLUGIN_JSON.tmp" && command mv "$PLUGIN_JSON.tmp" "$PLUGIN_JSON"

  # Keep package.json in lockstep when present (TS plugins carry a separate `version`
  # and `xcsh.version`). package.json is not release-authoritative — marketplace.json +
  # plugin.json are — but syncing it prevents the manifests from drifting.
  PKG_JSON="$REPO_ROOT/plugins/$name/package.json"
  if [[ -f "$PKG_JSON" ]]; then
    jq --arg v "$NEW_VER" \
      '.version = $v | (if .xcsh then .xcsh.version = $v else . end)' \
      "$PKG_JSON" >"$PKG_JSON.tmp" && command mv "$PKG_JSON.tmp" "$PKG_JSON"
  fi

  echo "  $name: $OLD_VER → $NEW_VER"
  # Backtick the plugin name (it is a literal identifier) so the CHANGELOG entry does not
  # trip the Lint Code Base textlint terminology rule for names like azure/github/gitlab
  # (code spans are exempt). The release-notes grep in release-plugins.yml still matches.
  CHANGELOG_ENTRIES+=("- **\`$name\`** bumped to v$NEW_VER")
done

# ── Update CHANGELOG.md ─────────────────────────────────────

CHANGELOG="$REPO_ROOT/CHANGELOG.md"
if [[ -f "$CHANGELOG" ]]; then
  # Build the insertion block: a leading blank line, entries separated by blank lines
  # (matching the loose-list style under "## [Unreleased]"), and a trailing newline.
  INSERT=$'\n'
  first=true
  for entry in "${CHANGELOG_ENTRIES[@]}"; do
    if $first; then
      INSERT+="$entry"
      first=false
    else
      INSERT+=$'\n\n'"$entry"
    fi
  done
  INSERT+=$'\n'

  # Insert immediately after the "## [Unreleased]" line. Portable in-place edit
  # (awk + temp file via ENVIRON, preserving real newlines) — avoids the GNU-only
  # `sed -i` that breaks on BSD/macOS.
  export INSERT
  awk '
    { print }
    !inserted && /^## \[Unreleased\]$/ { printf "%s", ENVIRON["INSERT"]; inserted = 1 }
  ' "$CHANGELOG" >"$CHANGELOG.tmp" && command mv "$CHANGELOG.tmp" "$CHANGELOG"
  echo ""
  echo "Updated CHANGELOG.md — edit the entries before committing."
fi

echo ""
echo "Done. Files modified:"
echo "  .xcsh-plugin/marketplace.json"
for name in "${PLUGINS[@]}"; do
  echo "  plugins/$name/.xcsh-plugin/plugin.json"
done
[[ -f "$CHANGELOG" ]] && echo "  CHANGELOG.md"
