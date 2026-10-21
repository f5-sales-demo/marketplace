#!/usr/bin/env bash
# Validate executable guidance against the shipped skill and caller scope.

set -euo pipefail

test_review_command_resolves_shipped_skill() {
  local command="$PLUGIN_ROOT/commands/review-mdx.md"
  local skill
  skill=$(sed -n 's/.*skill:\/\/docs-tools:\([a-z-]*\).*/\1/p' "$command")
  [ -n "$skill" ] && [ -f "$PLUGIN_ROOT/skills/$skill/SKILL.md" ] || {
    echo "review-mdx must resolve a canonical shipped skill"
    return 1
  }
}

test_reviewer_preserves_explicit_scope() {
  local skill="$PLUGIN_ROOT/skills/content-reviewer/SKILL.md"
  grep -qF 'Explicit caller scope takes precedence over changed-file selection.' "$skill"
  grep -qF 'Do not widen an explicit scope' "$skill"
}

test_reviewer_reports_incomplete_and_empty_scope() {
  local skill="$PLUGIN_ROOT/skills/content-reviewer/SKILL.md"
  grep -qF 'If no files match, report zero files reviewed' "$skill"
  grep -qF 'Unreadable or malformed files are incomplete review' "$skill"
  grep -qF 'Show at most twelve findings in the initial preview' "$skill"
  grep -qF 'Include every remaining finding once' "$skill"
}

test_agent_uses_declared_tool_names() {
  local agent="$PLUGIN_ROOT/agents/mdx-content-reviewer.md"
  if grep -qE '\b(Glob|Grep)\b' "$agent"; then
    echo "agent guidance must use declared tool names"
    return 1
  fi
  grep -qF 'Use `find`' "$agent"
  grep -qF 'Use `grep`' "$agent"
}
