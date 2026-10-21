#!/usr/bin/env bash
# Shipped reporting contracts separate catalog discovery from execution evidence.
set -euo pipefail

test_catalog_has_scoped_preview_and_completion() {
  local file="$PLUGIN_ROOT/commands/osint-catalog.md"
  grep -q 'first twelve rows' "$file"
  grep -q 'total and shown counts' "$file"
  grep -q 'catalog-only' "$file"
  grep -q 'unavailable' "$file"
}

test_all_guidance_has_evidence_reporting_contract() {
  local file
  for file in "$PLUGIN_ROOT"/skills/*/SKILL.md "$PLUGIN_ROOT"/agents/*.md; do
    grep -q '^## Evidence and reporting' "$file" || return 1
    grep -q 'first twelve rows' "$file" || return 1
    grep -q 'unknown' "$file" || return 1
    grep -q 'completion' "$file" || return 1
  done
}

test_generator_preserves_reporting_contract() {
  local staging
  staging="$(mktemp -d)"
  mkdir -p "$staging/scripts" "$staging/skills/ai-tools/references"
  cp "$PLUGIN_ROOT/scripts/generate-skills.sh" "$staging/scripts/generate-skills.sh"
  printf '### Synthetic catalog entry\n' >"$staging/skills/ai-tools/references/tools.md"
  bash "$staging/scripts/generate-skills.sh" >"$staging/generation.log"
  grep -q '^## Evidence and reporting' "$staging/skills/ai-tools/SKILL.md"
  grep -q 'first twelve rows' "$staging/skills/ai-tools/SKILL.md"
  grep -q 'list of 1 free tools' "$staging/skills/ai-tools/SKILL.md"
  local original
  original="$(shasum -a 256 "$staging/skills/ai-tools/SKILL.md")"
  bash "$staging/scripts/generate-skills.sh" >>"$staging/generation.log"
  [ "$original" = "$(shasum -a 256 "$staging/skills/ai-tools/SKILL.md")" ]
  rm -rf "$staging"
}
