#!/usr/bin/env bash
set -euo pipefail

source_root=$(cd "$(dirname "$0")/.." && pwd)
expected_bun_version="1.4.5"
expected_lockfile_version="2"

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

# Types must match the locked declaration and the selected runtime API family.
# Exact and caret specifications are supported; newer patch releases qualify
# immediately after the CI runtime and its verified artifacts are updated.
python3 - "$source_root" "$expected_bun_version" <<'PY'
from pathlib import Path
import json
import re
import sys

root = Path(sys.argv[1])
stable = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")


def version(value):
    if not isinstance(value, str) or not stable.fullmatch(value):
        raise ValueError("requires a stable version")
    return tuple(map(int, value.split(".")))


runtime = version(sys.argv[2])
try:
    for manifest in sorted((root / "plugins").glob("*/package.json")):
        data = json.loads(manifest.read_text())
        dependencies = data.get("devDependencies", {})
        if not isinstance(dependencies, dict):
            raise ValueError("invalid devDependencies")
        if "bun-types" not in dependencies:
            continue
        declared = dependencies["bun-types"]
        if not isinstance(declared, str):
            raise ValueError("bun-types requires an exact or caret stable version")
        caret = declared.startswith("^")
        minimum = version(declared[1:] if caret else declared)
        lockfile = manifest.with_name("bun.lock")
        matches = re.findall(
            r'^\s*"bun-types"\s*:\s*\[\s*"bun-types@([^"\r\n]+)"',
            lockfile.read_text(),
            flags=re.MULTILINE,
        )
        if len(matches) != 1:
            raise ValueError("requires one unambiguous locked bun-types package")
        locked = version(matches[0])
        if (locked[:2] != runtime[:2] or minimum[:2] != runtime[:2]
                or locked > runtime or locked < minimum
                or (not caret and locked != minimum)):
            raise ValueError("bun-types declaration, lock and CI runtime are incompatible")
except (OSError, ValueError, TypeError) as error:
    print(f"FAIL: {manifest.relative_to(root)}: {error}", file=sys.stderr)
    sys.exit(1)
PY
pass "every Bun-typed plugin has a compatible declaration and locked API version"
