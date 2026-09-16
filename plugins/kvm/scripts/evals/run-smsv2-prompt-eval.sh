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
args=(
  --thinking low
  --mode json
  --plugin-dir "$marketplace_dir/plugins/platform"
  --plugin-dir "$plugin_dir"
  --no-session
  -p "$prompt"
)
if [ -n "$model" ]; then
  args=(--model "$model" "${args[@]}")
fi

xcsh "${args[@]}" >"$trace_file"
bun "$marketplace_dir/benchmarks/verify-ce-prompt-trace.ts" \
  "$scenario_file" "$scenario_id" "$trace_file"
