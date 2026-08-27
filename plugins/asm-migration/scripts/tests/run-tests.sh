#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)

jq -e '.name == "asm-migration" and .version == "1.0.0"' "$ROOT/.xcsh-plugin/plugin.json" >/dev/null
jq -e '.xcsh.extensions == ["src/index.ts"] and (.xcsh.commands | length) == 2' "$ROOT/package.json" >/dev/null
test -s "$ROOT/dist/runtime.js"
test -s "$ROOT/contracts/f5xc-create-v1.json"
test "$(sha256sum "$ROOT/contracts/f5xc-create-v1.json" | awk '{print $1}')" = "$(jq -r .bundle_sha256 "$ROOT/contracts/provenance.json")"
! grep -ERn 'https?://|fetch\(|Bun\.spawn\(' "$ROOT/src" --include='*.ts'

echo 'asm-migration structural checks passed'
