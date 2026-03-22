#!/usr/bin/env bash
# Validate marketplace and plugin manifests for structural correctness.
# Called by .github/workflows/validate-plugins.yml
# Dependencies: jq (installed in the workflow)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
ERRORS=0

error() {
  echo "ERROR: $1" >&2
  ERRORS=$((ERRORS + 1))
}

info() {
  echo "INFO: $1"
}

# ── 1. marketplace.json existence ────────────────────────────
if [[ ! -f "$MARKETPLACE" ]]; then
  error "marketplace.json not found at $MARKETPLACE"
  exit 1
fi

info "Validating $MARKETPLACE"

# ── 2. marketplace.json required top-level fields ────────────
for field in .name .metadata.description .owner.name .plugins; do
  val=$(jq -r "$field // empty" "$MARKETPLACE")
  if [[ -z "$val" ]]; then
    error "marketplace.json missing required field: $field"
  fi
done

# ── 3. Plugin entry required fields ─────────────────────────
PLUGIN_COUNT=$(jq '.plugins | length' "$MARKETPLACE")
if [[ "$PLUGIN_COUNT" -eq 0 ]]; then
  error "marketplace.json has zero plugins"
fi

for i in $(seq 0 $((PLUGIN_COUNT - 1))); do
  PLUGIN_NAME=$(jq -r ".plugins[$i].name // empty" "$MARKETPLACE")
  info "Checking marketplace entry: ${PLUGIN_NAME:-<unnamed plugin $i>}"

  for field in name description version author.name source category; do
    jq_path=".plugins[$i].${field}"
    val=$(jq -r "$jq_path // empty" "$MARKETPLACE")
    if [[ -z "$val" ]]; then
      error "Plugin entry $i ($PLUGIN_NAME): missing required field '$field'"
    fi
  done

  # ── 4. Source path resolves to a plugin directory ───────────
  SOURCE=$(jq -r ".plugins[$i].source // empty" "$MARKETPLACE")
  if [[ -n "$SOURCE" ]]; then
    PLUGIN_DIR="$REPO_ROOT/$SOURCE"
    PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"

    if [[ ! -d "$PLUGIN_DIR" ]]; then
      error "Plugin '$PLUGIN_NAME': source directory not found: $SOURCE"
      continue
    fi

    if [[ ! -f "$PLUGIN_JSON" ]]; then
      error "Plugin '$PLUGIN_NAME': missing .claude-plugin/plugin.json in $SOURCE"
      continue
    fi

    info "  Validating $PLUGIN_JSON"

    # ── 5. plugin.json required fields ─────────────────────────
    for field in name description version author.name; do
      jq_path=".${field}"
      val=$(jq -r "$jq_path // empty" "$PLUGIN_JSON")
      if [[ -z "$val" ]]; then
        error "Plugin '$PLUGIN_NAME' plugin.json: missing required field '$field'"
      fi
    done

    # ── 6. Cross-reference: name and version match ─────────────
    MKT_NAME=$(jq -r ".plugins[$i].name" "$MARKETPLACE")
    PLG_NAME=$(jq -r ".name" "$PLUGIN_JSON")
    if [[ "$MKT_NAME" != "$PLG_NAME" ]]; then
      error "Name mismatch: marketplace.json='$MKT_NAME' vs plugin.json='$PLG_NAME'"
    fi

    MKT_VER=$(jq -r ".plugins[$i].version" "$MARKETPLACE")
    PLG_VER=$(jq -r ".version" "$PLUGIN_JSON")
    if [[ "$MKT_VER" != "$PLG_VER" ]]; then
      error "Version mismatch for '$PLUGIN_NAME': marketplace.json='$MKT_VER' vs plugin.json='$PLG_VER'"
    fi

    # ── 7. SKILL.md frontmatter validation ─────────────────────
    SKILL_COUNT=0
    while IFS= read -r -d '' skill_file; do
      SKILL_COUNT=$((SKILL_COUNT + 1))
      # Extract YAML frontmatter between --- delimiters
      frontmatter=$(sed -n '/^---$/,/^---$/p' "$skill_file" | sed '1d;$d')

      skill_name=$(echo "$frontmatter" | grep -E '^name:' | sed 's/^name:[[:space:]]*//' || true)
      skill_desc=$(echo "$frontmatter" | grep -E '^description:' | sed 's/^description:[[:space:]]*//' || true)

      rel_path="${skill_file#"$REPO_ROOT"/}"
      if [[ -z "$skill_name" ]]; then
        error "SKILL.md missing 'name' in frontmatter: $rel_path"
      fi
      if [[ -z "$skill_desc" ]]; then
        error "SKILL.md missing 'description' in frontmatter: $rel_path"
      fi
    done < <(find "$PLUGIN_DIR/skills" -name "SKILL.md" -print0 2>/dev/null)

    # ── 8. Command frontmatter validation ──────────────────────
    CMD_COUNT=0
    while IFS= read -r -d '' cmd_file; do
      CMD_COUNT=$((CMD_COUNT + 1))
      frontmatter=$(sed -n '/^---$/,/^---$/p' "$cmd_file" | sed '1d;$d')

      cmd_desc=$(echo "$frontmatter" | grep -E '^description:' | sed 's/^description:[[:space:]]*//' || true)

      rel_path="${cmd_file#"$REPO_ROOT"/}"
      if [[ -z "$cmd_desc" ]]; then
        error "Command missing 'description' in frontmatter: $rel_path"
      fi
    done < <(find "$PLUGIN_DIR/commands" -name "*.md" -print0 2>/dev/null)

    # ── 9. Plugin has at least one skill or command ────────────
    TOTAL=$((SKILL_COUNT + CMD_COUNT))
    if [[ "$TOTAL" -eq 0 ]]; then
      error "Plugin '$PLUGIN_NAME': no skills or commands found"
    else
      info "  Found $SKILL_COUNT skill(s), $CMD_COUNT command(s)"
    fi
  fi
done

# ── Summary ──────────────────────────────────────────────────
echo ""
if [[ "$ERRORS" -gt 0 ]]; then
  echo "FAILED: $ERRORS error(s) found"
  exit 1
else
  echo "PASSED: All validation checks passed"
  exit 0
fi
