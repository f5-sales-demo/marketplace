#!/usr/bin/env bash

test_kvm_plugin_manifest() {
  jq -e '
    .name == "kvm" and
    .version == (input | .version) and
    (.description | contains("Secure Mesh Site v2")) and
    .author.name == "f5-sales-demo"
  ' "$PLUGIN_ROOT/.xcsh-plugin/plugin.json" "$PLUGIN_ROOT/package.json" >/dev/null
}

test_kvm_marketplace_entry() {
  jq -e '
    [.plugins[] | select(
      .name == "kvm" and
      .version == $version and
      .source == "./plugins/kvm" and
      .recommended == true
    )] | length == 1
  ' --arg version "$(jq -r .version "$PLUGIN_ROOT/.xcsh-plugin/plugin.json")" \
    "$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json" >/dev/null
}

test_kvm_required_surfaces() {
  local path
  for path in \
    package.json \
    bun.lock \
    tsconfig.json \
    src/index.ts \
    src/prompt-trace.ts \
    scripts/evals/run-smsv2-prompt-eval.sh \
    benchmarks/verify-smsv2-prompt-trace.ts \
    skills/kvm-smsv2/SKILL.md \
    skills/kvm-smsv2/agents/openai.yaml \
    benchmarks/smsv2-prompt-scenarios.json; do
    [ -f "$PLUGIN_ROOT/$path" ] || {
      echo "missing: $path"
      return 1
    }
  done
}

test_kvm_prompt_eval_runner() {
  grep -q 'benchmarks/verify-smsv2-prompt-trace.ts' "$PLUGIN_ROOT/scripts/evals/run-smsv2-prompt-eval.sh" &&
    grep -q -- '--thinking low' "$PLUGIN_ROOT/scripts/evals/run-smsv2-prompt-eval.sh" &&
    ! grep -q -- '--thinking minimal' "$PLUGIN_ROOT/scripts/evals/run-smsv2-prompt-eval.sh" &&
    jq -e '.scripts["eval:smsv2-prompt"] == "bash scripts/evals/run-smsv2-prompt-eval.sh"' \
      "$PLUGIN_ROOT/package.json" >/dev/null
}

test_kvm_skill_frontmatter() {
  grep -q '^name: kvm-smsv2$' "$PLUGIN_ROOT/skills/kvm-smsv2/SKILL.md"
  grep -q '^description:' "$PLUGIN_ROOT/skills/kvm-smsv2/SKILL.md"
}

test_kvm_has_no_azure_or_manual_repair_path() {
  ! rg -n -i 'az login|azure portal|manually (create|repair)' \
    "$PLUGIN_ROOT/src" "$PLUGIN_ROOT/skills" "$PLUGIN_ROOT/benchmarks"
  ! rg -n -i "['\"](?:import|taint|state (?:mv|rm))['\"]" "$PLUGIN_ROOT/src"
  grep -q 'Do not use Terraform import, taint, direct state editing' "$PLUGIN_ROOT/skills/kvm-smsv2/SKILL.md"
}
