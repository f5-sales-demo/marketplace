#!/usr/bin/env bash
set -euo pipefail

source_root=$(cd "$(dirname "$0")/.." && pwd)
expected_bun_version="1.4.2"
expected_lockfile_version="2"
expected_bun_types_range="^1.4.2"

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

grep -Fq "bun_version=$expected_bun_version" "$source_root/scripts/install-ci-bun.sh" ||
  fail "CI Bun installer must pin $expected_bun_version"
grep -Fq "expected_bun_version=\"$expected_bun_version\"" \
  "$source_root/scripts/check-ci-bun-lockfile-compatibility.sh" ||
  fail "lockfile compatibility gate must pin $expected_bun_version"
grep -Fq "supported_lockfile_versions=\"$expected_lockfile_version\"" \
  "$source_root/scripts/check-ci-bun-lockfile-compatibility.sh" ||
  fail "lockfile compatibility gate must require version $expected_lockfile_version"
pass "CI runtime and lockfile gate use Bun $expected_bun_version"

for lockfile in "$source_root"/plugins/*/bun.lock; do
  actual=$(sed -n 's/^[[:space:]]*"lockfileVersion"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$lockfile" | head -n 1)
  [ "$actual" = "$expected_lockfile_version" ] ||
    fail "${lockfile#"$source_root"/} must use lockfileVersion $expected_lockfile_version, got ${actual:-missing}"
done
pass "every tracked Bun lockfile uses format $expected_lockfile_version"

for manifest in "$source_root"/plugins/*/package.json; do
  if ! declared=$(jq -er '.devDependencies["bun-types"] // empty' "$manifest"); then
    continue
  fi
  [ "$declared" = "$expected_bun_types_range" ] ||
    fail "${manifest#"$source_root"/} must declare bun-types $expected_bun_types_range, got $declared"
  lockfile="${manifest%/package.json}/bun.lock"
  grep -Fq "\"bun-types@$expected_bun_version\"" "$lockfile" ||
    fail "${lockfile#"$source_root"/} must resolve bun-types $expected_bun_version"
done
pass "every Bun-typed plugin declares and resolves bun-types $expected_bun_version"
