#!/usr/bin/env bash
# Ensure committed text lockfiles stay readable by the Bun release installed in CI.
#
# Bun 1.4.2 writes lockfile version 2. Keep one generated format across every
# plugin so a developer cannot silently regenerate a legacy version-1 lock with
# an older Bun. Reject a future format until its parser support has been
# explicitly verified and the pinned runtime updated.
set -euo pipefail

repo_root="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
expected_bun_version="1.4.2"
supported_lockfile_versions="2"

if ! command -v bun >/dev/null 2>&1; then
  echo "FATAL: bun is required to check CI lockfile compatibility" >&2
  exit 2
fi

actual_bun_version="$(bun --version)"
if [[ "$actual_bun_version" != "$expected_bun_version" ]]; then
  printf 'FATAL: expected CI Bun %s, got %s\n' "$expected_bun_version" "$actual_bun_version" >&2
  exit 2
fi

failed=0
while IFS= read -r -d '' lockfile; do
  actual_lockfile_version="$(sed -n 's/^[[:space:]]*"lockfileVersion"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$lockfile" | head -n 1)"
  if [[ " $supported_lockfile_versions " != *" ${actual_lockfile_version:-missing} "* ]]; then
    printf 'FATAL: %s uses lockfileVersion %s; CI Bun %s supports versions %s\n' \
      "${lockfile#"$repo_root"/}" "${actual_lockfile_version:-missing}" \
      "$expected_bun_version" "$supported_lockfile_versions" >&2
    failed=1
  fi
done < <(find "$repo_root/plugins" -name bun.lock -type f -print0 | LC_ALL=C sort -z)

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

printf 'All plugin Bun lockfiles are compatible with CI Bun %s.\n' "$expected_bun_version"
