#!/usr/bin/env bash
# Repository-wide Markdown and MDX inventory contract.
#
# Pull-request linting is intentionally changed-file scoped. This test keeps the
# complete tracked prose inventory clean so legacy findings cannot accumulate
# outside a pull request's diff.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

MARKDOWNLINT_PACKAGE="markdownlint-cli@0.49.1"

markdown_files=()
while IFS= read -r -d '' path; do
  markdown_files+=("$path")
done < <(git ls-files -z -- '*.md')

if [ "${#markdown_files[@]}" -eq 0 ]; then
  echo "FATAL: no tracked Markdown files found" >&2
  exit 1
fi

npx --yes "$MARKDOWNLINT_PACKAGE" \
  --config "$REPO_ROOT/.markdownlint.json" \
  "${markdown_files[@]}"

mdx_files=()
while IFS= read -r -d '' path; do
  mdx_files+=("$path")
done < <(git ls-files -z -- '*.mdx')

if [ "${#mdx_files[@]}" -eq 0 ]; then
  echo "FATAL: no tracked MDX files found" >&2
  exit 1
fi

bash scripts/lint-mdx-prose.sh "${mdx_files[@]}"

echo "Repository-wide Markdown and MDX inventory passed."
