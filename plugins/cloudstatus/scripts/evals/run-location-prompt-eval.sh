#!/usr/bin/env bash
set -euo pipefail

plugin_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
scenario_file="$plugin_dir/benchmarks/location-prompt-scenarios.json"
scenario_id=${1:-visual-us}
model=${2:-gpt-5.6-luna}
xcsh_bin=${XCSH_BIN:-xcsh}
xcsh_dev_dir=${XCSH_DEV_DIR:-}
repeat=${LOCATION_UAT_REPEAT:-1}
synthesize=${LOCATION_UAT_SYNTHESIZE:-0}
if [ -n "${LOCATION_UAT_ARTIFACT_DIR:-}" ]; then
  artifact_dir=$LOCATION_UAT_ARTIFACT_DIR
  artifact_dir_owned=0
else
  artifact_dir=$(mktemp -d "${TMPDIR:-/tmp}/cloudstatus-location-prompt-traces.XXXXXX")
  artifact_dir_owned=1
fi
keep_artifacts=0
mkdir -p "$artifact_dir"
trap '[ "$keep_artifacts" -eq 1 ] || [ "$artifact_dir_owned" -eq 0 ] || rm -rf "$artifact_dir"' EXIT

if [ "$scenario_id" = "--all" ]; then
  while IFS= read -r id; do
    "$0" "$id" "$model"
  done < <(jq -r '.scenarios[].id' "$scenario_file")
  exit 0
fi

run_xcsh() {
  if [ -n "$xcsh_dev_dir" ]; then
    (
      cd "$xcsh_dev_dir"
      bun run dev -- "$@"
    )
  else
    "$xcsh_bin" "$@"
  fi
}

run_one() {
  local run_id=$1
  local prompt=$2
  local trace_file="$artifact_dir/${scenario_id}-${run_id}.jsonl"
  run_xcsh \
    --model "$model" \
    --thinking low \
    --mode json \
    --plugin-dir "$plugin_dir" \
    --no-session \
    -p "$prompt" >"$trace_file"
  if ! python3 "$plugin_dir/benchmarks/verify-location-prompt-trace.py" "$scenario_file" "$scenario_id" "$trace_file"; then
    keep_artifacts=1
    echo "trace retained for diagnosis: $trace_file" >&2
    return 1
  fi
}

if [ "$synthesize" = 1 ]; then
  [ "$scenario_id" = "visual-address-us" ] || {
    echo "LOCATION_UAT_SYNTHESIZE=1 requires visual-address-us" >&2
    exit 2
  }
  run=0
  while IFS= read -r item; do
    prompt=$(jq -er '.prompt' <<<"$item")
    run=$((run + 1))
    run_one "$run" "$prompt"
  done < <(python3 "$plugin_dir/scripts/evals/synthesize-location-prompt-uats.py" --scenario "$scenario_id" --count "$repeat")
else
  prompt=$(jq -er --arg id "$scenario_id" '.scenarios[] | select(.id == $id) | .prompt' "$scenario_file")
  for run in $(seq 1 "$repeat"); do
    run_one "$run" "$prompt"
  done
fi
