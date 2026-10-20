#!/usr/bin/env bash
# Test an exact minimum in an owned copy; never rewrite a developer dependency graph.
set -euo pipefail
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^(aws|azure|gcloud|platform|github|gitlab|salesforce|firecrawl)$ ]]; then
  echo "Usage: $0 <aws|azure|gcloud|platform|github|gitlab|salesforce|firecrawl>" >&2
  exit 2
fi
PLUGIN="$1"
SOURCE="$REPO_ROOT/plugins/$PLUGIN"
MINIMUM=$(jq -er '.minimumRuntimeVersion | select(type == "string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' \
  "$SOURCE/.xcsh-plugin/plugin.json")
command -v bun >/dev/null
command -v rsync >/dev/null
WORK=$(mktemp -d)
LOG=$(mktemp "${TMPDIR:-/tmp}/marketplace-minimum-$PLUGIN.XXXXXX")
chmod 600 "$LOG"
RM_BIN=$(command -v rm)
trap '"$RM_BIN" -rf "$WORK"' EXIT
mkdir -p "$WORK/repo/plugins/$PLUGIN" "$WORK/bin"
# Repository-relative test helpers must retain their original directory depth.
rsync -a --exclude=node_modules --exclude=.git "$REPO_ROOT/benchmarks/" "$WORK/repo/benchmarks/"
COPY="$WORK/repo/plugins/$PLUGIN"
rsync -a --exclude=node_modules --exclude=.git "$SOURCE/" "$COPY/"
jq --arg minimum "$MINIMUM" '.devDependencies["@f5-sales-demo/xcsh"] = $minimum' \
  "$COPY/package.json" >"$WORK/package.tmp"
mv "$WORK/package.tmp" "$COPY/package.json"
rm -f "$COPY/bun.lock" "$COPY/bun.lockb"
# Match canonical test-runner exclusions by binary, not by PATH directory.
IFS=':' read -r -a ENTRIES <<<"$PATH"
for entry in "${ENTRIES[@]}"; do
  [ -d "$entry" ] || continue
  links=()
  for executable in "$entry"/*; do
    [ -f "$executable" ] && [ -x "$executable" ] || continue
    name="${executable##*/}"
    case "$name" in aws | az | gcloud | gh | glab | sf) continue ;; esac
    [ -e "$WORK/bin/$name" ] || links+=("$executable")
  done
  if [ "${#links[@]}" -gt 0 ]; then ln -s "${links[@]}" "$WORK/bin"; fi
done
printf 'Minimum runtime: plugin=%s runtime=%s log=%s\n' "$PLUGIN" "$MINIMUM" "$LOG"
(
  export PUPPETEER_SKIP_DOWNLOAD=1
  if [ "$PLUGIN" = salesforce ] || [ "$PLUGIN" = firecrawl ]; then
    validation="$WORK/repo/scripts/agent-validation-runtime"
    mkdir -p "$validation"
    jq --arg minimum "$MINIMUM" '.dependencies["@f5-sales-demo/xcsh"] = $minimum' \
      "$REPO_ROOT/scripts/agent-validation-runtime/package.json" >"$validation/package.json"
    if [ "$PLUGIN" = firecrawl ]; then
      cp "$REPO_ROOT/scripts/agent-validation-runtime/firecrawl-workflows.test.ts" "$validation/"
    fi
    (cd "$validation" && bun install --ignore-scripts)
    [ "$(jq -er '.version' "$validation/node_modules/@f5-sales-demo/xcsh/package.json")" = "$MINIMUM" ]
  fi
  if [ "$PLUGIN" = firecrawl ]; then
    export PATH="$WORK/bin"
    for cli in aws az gcloud gh glab sf; do
      if command -v "$cli" >/dev/null; then
        echo "CLI exclusion failed: $cli" >&2
        exit 1
      fi
    done
    cd "$validation"
    bun test firecrawl-workflows.test.ts || exit $?
    exit 0
  fi
  cd "$COPY"
  bun install --ignore-scripts
  actual=$(jq -er '.version' node_modules/@f5-sales-demo/xcsh/package.json)
  [ "$actual" = "$MINIMUM" ] || {
    echo "Wrong installed minimum: $actual" >&2
    exit 1
  }
  export PATH="$WORK/bin"
  for cli in aws az gcloud gh glab sf; do
    if command -v "$cli" >/dev/null; then
      echo "CLI exclusion failed: $cli" >&2
      exit 1
    fi
  done
  bun test
) >"$LOG" 2>&1 || {
  tail -80 "$LOG" >&2
  exit 1
}
tail -8 "$LOG"
