#!/usr/bin/env bash
# run-plugin-tests.sh — run every plugin's test suite.
#
# Each plugin ships `scripts/tests/run-tests.sh` (shell acceptance) and, where it has a
# TypeScript engine, `*.test.ts` files run by bun. Until now nothing ran either in CI, so a
# plugin could merge with its own guards failing — including the workbook-spec guard, whose
# entire job is to fail the build.
#
# KNOWN_RED is deliberately not an allowlist of green plugins. An allowlist rots silently: a
# newly added plugin would inherit no gate at all, which is the same failure this script
# exists to close. Instead every plugin must pass, and the few that are already red are
# named here against a tracking issue.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

# Plugins with pre-existing failures, tracked in issue #873. Remove a name when its suite
# goes green; the run warns when one of these passes, so the list has a visible expiry.
#
# The warning is not a failure on purpose. Some of these suites shell out to a cloud CLI and
# so fail differently on a developer's machine than on a CI runner, and a gate that flaps
# between the two gets switched off rather than fixed.
KNOWN_RED=(aws azure gcloud salesforce salesforce-legacy)

# A missing runtime must not read as a pass: the per-plugin suites skip themselves when bun
# is absent, which in CI would be a silent no-op gate.
export REQUIRE_BUN=1

command -v bun >/dev/null 2>&1 || {
  echo "FATAL: bun is required to run the plugin test suites" >&2
  exit 2
}

is_known_red() {
  local name="$1" p
  for p in "${KNOWN_RED[@]}"; do [ "$p" = "$name" ] && return 0; done
  return 1
}

failed=()
unexpectedly_green=()

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

  if is_known_red "$plugin"; then
    if [ "$ok" -eq 0 ]; then
      unexpectedly_green+=("$plugin")
    else
      printf '    (known red — not failing the build)\n'
    fi
  elif [ "$ok" -ne 0 ]; then
    failed+=("$plugin")
  fi
done

status=0

if [ "${#failed[@]}" -gt 0 ]; then
  printf '\nFAILED: %s\n' "${failed[*]}" >&2
  status=1
fi

if [ "${#unexpectedly_green[@]}" -gt 0 ]; then
  printf '\nWARNING: listed in KNOWN_RED but now passing: %s\n' "${unexpectedly_green[*]}" >&2
  printf 'Remove them from KNOWN_RED in %s so the gate starts holding them green.\n' "$0" >&2
fi

[ "$status" -eq 0 ] && printf '\nAll gated plugin suites passed.\n'
exit "$status"
