#!/usr/bin/env bash
set -euo pipefail

plugin_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
marketplace_dir=$(cd "$plugin_dir/../.." && pwd)
scenario_file="$plugin_dir/benchmarks/ce-prompt-scenarios.json"
scenario_id=${1:-greenfield-single-node-direct-eni}
model=${2:-google-antigravity/gemini-3-flash}
trace_file=$(mktemp "${TMPDIR:-/tmp}/aws-ce-prompt-trace.XXXXXX.jsonl")
trap 'rm -f "$trace_file"' EXIT

prompt=$(jq -er --arg id "$scenario_id" '.scenarios[] | select(.id == $id) | .prompt' "$scenario_file")

xcsh \
  --model "$model" \
  --thinking minimal \
  --mode json \
  --plugin-dir "$marketplace_dir/plugins/platform" \
  --plugin-dir "$plugin_dir" \
  --no-session \
  -p "$prompt" >"$trace_file"

bun "$marketplace_dir/benchmarks/verify-ce-prompt-trace.ts" "$scenario_file" "$scenario_id" "$trace_file"
