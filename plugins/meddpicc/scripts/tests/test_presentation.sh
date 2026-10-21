#!/usr/bin/env bash
# Shipped status must scope reads and retain engine truth.
test_status_requires_identified_deals() {
  grep -Fq 'explicitly supplied or identified' "$PLUGIN_ROOT/commands/meddpicc-status.md"
  ! grep -Fq 'Find deal data files in the current workspace' "$PLUGIN_ROOT/commands/meddpicc-status.md"
  grep -Fq 'Do not invoke deal-update' "$PLUGIN_ROOT/commands/meddpicc-status.md"
}
test_status_quotes_exact_engine_arguments() {
  grep -Fq 'next "$DEAL_FILE"' "$PLUGIN_ROOT/commands/meddpicc-status.md"
  grep -Fq 'score "$DEAL_FILE"' "$PLUGIN_ROOT/commands/meddpicc-status.md"
  grep -Fq 'validate "$DEAL_FILE"' "$PLUGIN_ROOT/commands/meddpicc-status.md"
}
test_workflows_report_evidence_and_completion() {
  local file
  for file in "$PLUGIN_ROOT"/skills/*/SKILL.md "$PLUGIN_ROOT"/agents/*.md; do
    grep -Fq '## Evidence and reporting' "$file" || return 1
    grep -Fq 'first 12 rows' "$file" || return 1
    grep -Fq 'zero, false, empty strings' "$file" || return 1
  done
}
