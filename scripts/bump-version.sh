#!/usr/bin/env bash
# Bump the version of one or all marketplace plugins.
# Updates both marketplace.json and the plugin's plugin.json in sync.
#
# Usage:
#   ./scripts/bump-version.sh <plugin-name> <major|minor|patch>
#   ./scripts/bump-version.sh --all <major|minor|patch>
set -euo pipefail

# Honour an inherited REPO_ROOT so the script can be exercised against a throwaway
# repository. Deriving it solely from $0 meant every invocation mutated the checkout the
# script lives in, which is why the CHANGELOG behaviour below had no test until a bad
# release note reached production.
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
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
# Parallel to CHANGELOG_ENTRIES: what to relabel, and to what, when an entry for this
# plugin is already sitting in [Unreleased].
CHANGELOG_NAMES=()
CHANGELOG_VERSIONS=()
JSON_FILES=("$MARKETPLACE")

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
  JSON_FILES+=("$PLUGIN_JSON")

  # Keep package.json in lockstep when present (TS plugins carry a separate `version`
  # and `xcsh.version`). package.json is not release-authoritative — marketplace.json +
  # plugin.json are — but syncing it prevents the manifests from drifting.
  PKG_JSON="$REPO_ROOT/plugins/$name/package.json"
  if [[ -f "$PKG_JSON" ]]; then
    jq --arg v "$NEW_VER" \
      '.version = $v | (if .xcsh then .xcsh.version = $v else . end)' \
      "$PKG_JSON" >"$PKG_JSON.tmp" && command mv "$PKG_JSON.tmp" "$PKG_JSON"
    JSON_FILES+=("$PKG_JSON")
  fi

  # …and any NESTED package.json the plugin ships (meddpicc carries `engine/`). These are
  # private sub-packages, not published, but a stale version there is a lie in a file that
  # looks authoritative — and it drifts silently, because the version-consistency test only
  # covers the three top-level manifests. Depth 2 is deliberate: deep enough for a plugin's
  # own sub-package, shallow enough never to walk into node_modules.
  while IFS= read -r nested; do
    [[ -n "$nested" ]] || continue
    jq --arg v "$NEW_VER" '.version = $v' "$nested" >"$nested.tmp" &&
      command mv "$nested.tmp" "$nested"
    JSON_FILES+=("$nested")
  done < <(find "$REPO_ROOT/plugins/$name" -mindepth 2 -maxdepth 2 -name package.json -not -path '*/node_modules/*' 2>/dev/null)

  echo "  $name: $OLD_VER → $NEW_VER"
  # Backtick the plugin name (it is a literal identifier) so the CHANGELOG entry does not
  # trip the Lint Code Base textlint terminology rule for names like azure/github/gitlab
  # (code spans are exempt). The release-notes grep in release-plugins.yml still matches.
  CHANGELOG_ENTRIES+=("- **\`$name\`** bumped to v$NEW_VER")
  CHANGELOG_NAMES+=("$name")
  CHANGELOG_VERSIONS+=("$NEW_VER")
done

# ── Format the written JSON with Biome ──────────────────────
# jq's output does not match Biome's JSON formatter, so the files it just wrote would
# fail `biome check` (the local pre-commit hook and the Lint Code Base gate). Format
# them in place so a bump — manual or via the auto-bump hook — is lint-clean with no
# manual step. Biome is the repo's JSON formatter (see .pre-commit-config.yaml).
if command -v biome >/dev/null 2>&1; then
  biome check --write "${JSON_FILES[@]}" >/dev/null 2>&1 || true
elif command -v npx >/dev/null 2>&1; then
  npx --yes @biomejs/biome check --write "${JSON_FILES[@]}" >/dev/null 2>&1 || true
else
  echo "WARN: biome not found; run 'biome check --write' on the bumped JSON before committing." >&2
fi

# ── Update CHANGELOG.md ─────────────────────────────────────

# Relabel the plugin's existing [Unreleased] entry to the new version, if it has one.
# Returns 0 when it rewrote a line, 1 when there was nothing to rewrite.
#
# Why this exists: a branch bumps once per commit, and the squash-merge publishes ONE
# release. Appending a line per bump therefore ships release notes listing versions that
# were never tagged — salesforce/v1.3.5 went out describing a v1.3.4 that does not exist.
# Rewriting in place makes N bumps converge on one entry at the current version.
#
# Both shapes are handled: the placeholder this script writes ("bumped to vX.Y.Z") and the
# hand-written prose a contributor replaces it with ("vX.Y.Z — describes the change"). Only
# the first match inside [Unreleased] is touched, so entries under earlier release headings
# are never rewritten.
#
# Prose is only relabelled when its version has no release tag. This repository leaves
# entries for shipped releases under [Unreleased] indefinitely, so the newest prose entry
# is often a description of an ALREADY-PUBLISHED version — relabelling that would silently
# reattribute shipped work to the version being cut and destroy the real note. Measured:
# without this guard, three bumps rewrote "v1.3.5 — schema is discovered at runtime" into
# "v1.3.8", losing what v1.3.5 actually was. When tags are unavailable (shallow clone) the
# check fails closed and prose is left alone, which is the safe direction.
already_released() {
  local name="$1" version="$2"
  [[ -n "$(git -C "$REPO_ROOT" tag -l "${name}/v${version}" 2>/dev/null)" ]]
}

# The first [Unreleased] entry for this plugin, as "form<TAB>version", or nothing.
find_changelog_entry() {
  local name="$1" file="$2"
  NAME="$name" awk '
    BEGIN { in_unreleased = 0 }
    /^## \[Unreleased\]$/ { in_unreleased = 1; next }
    /^## \[/ { in_unreleased = 0 }
    in_unreleased {
      prefix = "- **`" ENVIRON["NAME"] "`** "
      if (index($0, prefix) == 1) {
        rest = substr($0, length(prefix) + 1)
        if (match(rest, /^bumped to v[0-9]+\.[0-9]+\.[0-9]+/)) {
          print "placeholder\t" substr(rest, 12, RLENGTH - 11); exit
        }
        if (match(rest, /^v[0-9]+\.[0-9]+\.[0-9]+/)) {
          print "prose\t" substr(rest, 2, RLENGTH - 1); exit
        }
      }
    }
  ' "$file"
}

relabel_changelog_entry() {
  local name="$1" newver="$2" file="$3"

  local found form version
  found=$(find_changelog_entry "$name" "$file")
  [[ -n "$found" ]] || return 1
  form=${found%%$'\t'*}
  version=${found##*$'\t'}

  if [[ "$form" == "prose" ]] && already_released "$name" "$version"; then
    return 1
  fi

  NAME="$name" NEWVER="$newver" awk '
    BEGIN { updated = 0; in_unreleased = 0 }
    /^## \[Unreleased\]$/ { in_unreleased = 1; print; next }
    /^## \[/ { in_unreleased = 0 }
    {
      if (in_unreleased && !updated) {
        prefix = "- **`" ENVIRON["NAME"] "`** "
        if (index($0, prefix) == 1) {
          rest = substr($0, length(prefix) + 1)
          if (sub(/^bumped to v[0-9]+\.[0-9]+\.[0-9]+/, "bumped to v" ENVIRON["NEWVER"], rest) ||
              sub(/^v[0-9]+\.[0-9]+\.[0-9]+/, "v" ENVIRON["NEWVER"], rest)) {
            print prefix rest
            updated = 1
            next
          }
        }
      }
      print
    }
    END { exit(updated ? 0 : 1) }
  ' "$file" >"$file.tmp"
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    command mv "$file.tmp" "$file"
  else
    rm -f "$file.tmp"
  fi
  return $rc
}

CHANGELOG="$REPO_ROOT/CHANGELOG.md"
if [[ -f "$CHANGELOG" ]]; then
  # Relabel in place where an entry already exists; only the rest need inserting.
  PENDING_ENTRIES=()
  for i in "${!CHANGELOG_NAMES[@]}"; do
    if ! relabel_changelog_entry "${CHANGELOG_NAMES[$i]}" "${CHANGELOG_VERSIONS[$i]}" "$CHANGELOG"; then
      PENDING_ENTRIES+=("${CHANGELOG_ENTRIES[$i]}")
    fi
  done

  # Build the insertion block: a leading blank line, entries separated by blank lines
  # (matching the loose-list style under "## [Unreleased]"), and a trailing newline.
  INSERT=$'\n'
  first=true
  for entry in "${PENDING_ENTRIES[@]+"${PENDING_ENTRIES[@]}"}"; do
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
  # `sed -i` that breaks on BSD/macOS. Skipped entirely when every entry was relabelled
  # in place, so a repeat bump does not leave a stray blank line behind.
  if [[ ${#PENDING_ENTRIES[@]} -gt 0 ]]; then
    export INSERT
    awk '
      { print }
      !inserted && /^## \[Unreleased\]$/ { printf "%s", ENVIRON["INSERT"]; inserted = 1 }
    ' "$CHANGELOG" >"$CHANGELOG.tmp" && command mv "$CHANGELOG.tmp" "$CHANGELOG"
  fi
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
