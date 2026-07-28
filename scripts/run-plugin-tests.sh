#!/usr/bin/env bash
# run-plugin-tests.sh — run every plugin's test suite.
#
# Each plugin ships `scripts/tests/run-tests.sh` (shell acceptance) and, where it has a
# TypeScript engine, `*.test.ts` files run by bun. Nothing ran either in CI until #874, so a
# plugin could merge with its own guards failing — including the workbook-spec guard, whose
# entire job is to fail the build.
#
# Every plugin must pass. There is no exemption list: the five plugins that were red when
# this script landed are fixed (#873), and an allowlist would silently exempt the next
# plugin someone adds, which is the same failure this exists to close.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

# A missing runtime must not read as a pass: the per-plugin suites skip themselves when bun
# is absent, which in CI would be a silent no-op gate.
export REQUIRE_BUN=1

command -v bun >/dev/null 2>&1 || {
  echo "FATAL: bun is required to run the plugin test suites" >&2
  exit 2
}

failed=()

for suite in plugins/*/scripts/tests/run-tests.sh; do
  [ -f "$suite" ] || continue
  plugin="$(basename "$(dirname "$(dirname "$(dirname "$suite")")")")"
  printf '\n==> %s\n' "$plugin"

  ok=0
  bash "$suite" || ok=1

  # Only run bun tests where the plugin actually has some.
  if find "plugins/$plugin" -name '*.test.ts' -not -path '*/node_modules/*' -print -quit | grep -q .; then
    # Install first where there is a lockfile. Without it every import of a devDependency
    # fails with "Cannot find module", which reads exactly like broken code and is not.
    # Frozen so a stale lockfile fails here rather than resolving to something else.
    if [ -f "plugins/$plugin/bun.lock" ]; then
      (cd "plugins/$plugin" && bun install --frozen-lockfile) || ok=1
    fi
    (cd "plugins/$plugin" && bun test .) || ok=1
  fi

  [ "$ok" -ne 0 ] && failed+=("$plugin")
done

if [ "${#failed[@]}" -gt 0 ]; then
  printf '\nFAILED: %s\n' "${failed[*]}" >&2
  exit 1
fi

printf '\nAll plugin suites passed.\n'
