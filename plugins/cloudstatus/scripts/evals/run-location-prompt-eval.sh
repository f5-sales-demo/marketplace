#!/usr/bin/env bash
set -euo pipefail

plugin_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
scenario_file="$plugin_dir/benchmarks/location-prompt-scenarios.json"
scenario_id=${1:-visual-us}
model=${2:-gpt-5.6-luna}
xcsh_bin=${XCSH_BIN:-xcsh}
trace_file=$(mktemp "${TMPDIR:-/tmp}/cloudstatus-location-prompt-trace.XXXXXX.jsonl")
trap 'rm -f "$trace_file"' EXIT

prompt=$(jq -er --arg id "$scenario_id" '.scenarios[] | select(.id == $id) | .prompt' "$scenario_file")

"$xcsh_bin" \
  --model "$model" \
  --thinking low \
  --mode json \
  --plugin-dir "$plugin_dir" \
  --no-session \
  -p "$prompt" >"$trace_file"

python3 "$plugin_dir/benchmarks/verify-location-prompt-trace.py" "$scenario_file" "$scenario_id" "$trace_file"
