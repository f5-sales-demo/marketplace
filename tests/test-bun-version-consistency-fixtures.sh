#!/usr/bin/env bash
set -euo pipefail

source_root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fixture() {
  local name="$1" declared="$2" resolved="$3"
  local root="$work/$name"
  mkdir -p "$root/scripts" "$root/tests" "$root/plugins/example"
  cp "$source_root/tests/test-bun-version-consistency.sh" "$root/tests/"
  printf 'bun_version=1.4.5\n' >"$root/scripts/install-ci-bun.sh"
  printf 'expected_bun_version="1.4.5"\nsupported_lockfile_versions="2"\n' \
    >"$root/scripts/check-ci-bun-lockfile-compatibility.sh"
  jq -n --arg declared "$declared" '{devDependencies: {"bun-types": $declared}}' \
    >"$root/plugins/example/package.json"
  printf '{\n  "lockfileVersion": 2,\n  "packages": {\n    "bun-types": ["bun-types@%s", "", {}, "digest"],\n  },\n}\n' \
    "$resolved" >"$root/plugins/example/bun.lock"
}

expect_status() {
  local name="$1" wanted="$2" actual=0
  bash "$work/$name/tests/test-bun-version-consistency.sh" >"$work/$name/output" 2>&1 || actual=$?
  if [[ "$actual" != "$wanted" ]]; then
    cat "$work/$name/output" >&2
    printf 'FAIL: %s expected %s, got %s\n' "$name" "$wanted" "$actual" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$name"
}

fixture latest-exact 1.4.5 1.4.5
expect_status latest-exact 0
fixture latest-caret '^1.4.5' 1.4.5
expect_status latest-caret 0
fixture compatible-caret '^1.4.4' 1.4.5
expect_status compatible-caret 0
fixture compatible-exact 1.4.4 1.4.4
expect_status compatible-exact 0
fixture stale-api '^1.3.13' 1.3.13
expect_status stale-api 1
fixture future-runtime 1.4.6 1.4.6
expect_status future-runtime 1
fixture exact-lock-mismatch 1.4.5 1.4.4
expect_status exact-lock-mismatch 1
fixture range-lock-mismatch '^1.4.5' 1.4.4
expect_status range-lock-mismatch 1
fixture unreviewed-range '*' 1.4.5
expect_status unreviewed-range 1
fixture prerelease 1.4.5-beta.1 1.4.5-beta.1
expect_status prerelease 1
fixture missing-package 1.4.5 1.4.5
sed '/"bun-types": \[/d' "$work/missing-package/plugins/example/bun.lock" \
  >"$work/missing-package/lock"
mv "$work/missing-package/lock" "$work/missing-package/plugins/example/bun.lock"
expect_status missing-package 1
fixture ambiguous-package 1.4.5 1.4.5
printf '    "bun-types": ["bun-types@1.4.4", "", {}, "digest"],\n' \
  >>"$work/ambiguous-package/plugins/example/bun.lock"
expect_status ambiguous-package 1
fixture malformed-manifest 1.4.5 1.4.5
printf '{' >"$work/malformed-manifest/plugins/example/package.json"
expect_status malformed-manifest 1
fixture invalid-type 1.4.5 1.4.5
printf '{"devDependencies":{"bun-types":42}}\n' >"$work/invalid-type/plugins/example/package.json"
expect_status invalid-type 1
fixture legacy-format 1.4.5 1.4.5
sed 's/"lockfileVersion": 2/"lockfileVersion": 1/' "$work/legacy-format/plugins/example/bun.lock" \
  >"$work/legacy-format/lock"
mv "$work/legacy-format/lock" "$work/legacy-format/plugins/example/bun.lock"
expect_status legacy-format 1
fixture installer-drift 1.4.5 1.4.5
printf 'bun_version=1.4.4\n' >"$work/installer-drift/scripts/install-ci-bun.sh"
expect_status installer-drift 1
