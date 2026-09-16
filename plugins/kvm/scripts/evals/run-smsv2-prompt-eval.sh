#!/usr/bin/env bash
set -euo pipefail

plugin_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
marketplace_dir=$(cd "$plugin_dir/../.." && pwd)
scenario_file="$plugin_dir/benchmarks/smsv2-prompt-scenarios.json"
scenario_id=${1:-inspect-health-traffic}
model=${2:-}
trace_file=$(mktemp "${TMPDIR:-/tmp}/kvm-smsv2-prompt-trace.XXXXXX.jsonl")
trap 'rm -f "$trace_file"' EXIT

prompt=$(jq -er --arg id "$scenario_id" '.scenarios[] | select(.id == $id) | .prompt' "$scenario_file")
platform_dir="$marketplace_dir/plugins/platform"
if [ ! -f "$platform_dir/.xcsh-plugin/plugin.json" ]; then
  platform_dir=$(xcsh plugin list --json | jq -er '
    .marketplace[]
    | select(.id == "platform@f5-sales-demo-marketplace")
    | .entries
    | max_by(.installedAt)
    | .installPath
  ')
fi
[ -f "$platform_dir/.xcsh-plugin/plugin.json" ] || {
  echo "Installed Platform plugin is required for KVM prompt evaluation" >&2
  exit 2
}
args=(
  --thinking low
  --mode json
  --plugin-dir "$platform_dir"
  --plugin-dir "$plugin_dir"
  --no-session
  -p "$prompt"
)
if [ -n "$model" ]; then
  args=(--model "$model" "${args[@]}")
fi

xcsh "${args[@]}" >"$trace_file"
bun "$plugin_dir/benchmarks/verify-smsv2-prompt-trace.ts" \
  "$scenario_file" "$scenario_id" "$trace_file"
