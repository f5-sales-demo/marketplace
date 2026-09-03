#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
REPO_ROOT=$(cd "$ROOT/../.." && pwd)

jq -e '.name == "asm-migration" and (.version | test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' "$ROOT/.xcsh-plugin/plugin.json" >/dev/null
jq -e --arg version "$(jq -r .version "$ROOT/.xcsh-plugin/plugin.json")" \
  '.version == $version and .xcsh.version == $version' "$ROOT/package.json" >/dev/null
jq -e --arg version "$(jq -r .version "$ROOT/.xcsh-plugin/plugin.json")" \
  '.plugins[] | select(.name == "asm-migration") | .version == $version' \
  "$REPO_ROOT/.xcsh-plugin/marketplace.json" >/dev/null
jq -e '.xcsh.extensions == ["src/index.ts"] and (.xcsh.commands | length) == 3' "$ROOT/package.json" >/dev/null
test -s "$ROOT/dist/runtime.js"
test -s "$ROOT/contracts/f5xc-create-v1.json"
test "$(sha256sum "$ROOT/contracts/f5xc-create-v1.json" | awk '{print $1}')" = "$(jq -r .bundle_sha256 "$ROOT/contracts/provenance.json")"
test -s "$ROOT/scripts/import-contract.ts"
test -x "$ROOT/scripts/update-contract.sh"
if grep -ERn 'Bun\.spawn\(|child_process' "$ROOT/src" --include='*.ts'; then
  echo 'process entry point found in source' >&2
  exit 1
fi
if grep -ERn 'https?://|fetch\(' "$ROOT/src" --include='*.ts' --exclude='deployment.ts'; then
  echo 'network entry point found outside the guarded deployment client' >&2
  exit 1
fi

echo 'asm-migration structural checks passed'
