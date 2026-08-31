#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPOSITORY=f5-sales-demo/api-specs-enriched
command -v gh >/dev/null
command -v bun >/dev/null

release=$(gh release view --repo "$REPOSITORY" --json tagName --jq .tagName)
case "$release" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "latest release has an invalid tag: $release" >&2; exit 1 ;;
esac
commit=$(gh api "repos/$REPOSITORY/commits/$release" --jq .sha)
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "latest release did not resolve to an immutable commit" >&2
  exit 1
fi

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
gh release download "$release" --repo "$REPOSITORY" --pattern openapi.json --pattern api-catalog.json --dir "$temporary"
bun "$ROOT/scripts/import-contract.ts" \
  "$temporary/openapi.json" \
  "$temporary/api-catalog.json" \
  "$release" \
  "$commit" \
  "$ROOT/contracts"
printf 'Imported latest %s at %s\n' "$release" "$commit"
