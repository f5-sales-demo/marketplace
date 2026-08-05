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

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT" || exit 2

# A missing runtime must not read as a pass: the per-plugin suites skip themselves when bun
# is absent, which in CI would be a silent no-op gate.
export REQUIRE_BUN=1
# xcsh depends on Puppeteer for browser-backed tools, but plugin unit tests do not use a
# browser. Installing a plugin lock must never download platform browsers or depend on a
# developer's partially populated Puppeteer cache.
export PUPPETEER_SKIP_DOWNLOAD=true

command -v bun > /dev/null 2>&1 || {
  echo "FATAL: bun is required to run the plugin test suites" >&2
  exit 2
}

# The lockfiles are not enough: an existing workspace can remain physically linked to an
# obsolete xcsh/provider graph and make source tests exercise different code than the
# manifests specify. Repair from the frozen locks before any suite runs, then fail if the
# installed graph still disagrees.
if ! bash scripts/check-plugin-runtime-dependencies.sh --repair; then
  echo "FATAL: plugin runtime dependency precondition failed" >&2
  exit 1
fi

# The gate never calls a real cloud CLI.
#
# The runner ships aws, az, gcloud and gh, so the integration cases — the ones deliberately
# gated on a binary being present — would otherwise fire live commands against whatever
# credentials and network the runner happens to have. There is nothing to learn from that
# here: CI has no cloud account, so those tests assert only that an unauthenticated CLI
# answers, while importing every hang and rate limit the network can offer.
#
# Removing the binaries from PATH makes each of them skip, visibly. They still run for real
# on a developer machine, which is where a CLI and credentials actually exist.
#
# Exclusion is per BINARY, not per directory. Dropping whole directories looked simpler and
# broke the runner immediately: `gh` lives in /usr/bin there, so the whole of /usr/bin went,
# taking dirname, basename and everything else with it. On a Mac the CLIs sit in
# /opt/homebrew/bin next to bun, so the flaw was invisible locally.
CLI_NAMES=(aws az gcloud gh glab sf)
SANITIZED_BIN="$(mktemp -d)"
# Resolve rm before PATH changes: the trap fires with the sanitized PATH in effect.
RM_BIN="$(command -v rm)"
trap '"$RM_BIN" -rf "$SANITIZED_BIN"' EXIT

IFS=':' read -r -a _path_entries <<< "$PATH"
for _entry in "${_path_entries[@]}"; do
  [ -d "$_entry" ] || continue
  _links=()
  for _exe in "$_entry"/*; do
    [ -f "$_exe" ] && [ -x "$_exe" ] || continue
    _name="${_exe##*/}"
    for _cli in "${CLI_NAMES[@]}"; do
      [ "$_name" = "$_cli" ] && continue 2
    done
    # First one wins, which preserves the precedence the original PATH had.
    [ -e "$SANITIZED_BIN/$_name" ] || _links+=("$_exe")
  done
  # Creating one process per executable made this setup take minutes on developer
  # workstations with large PATH directories. ln accepts multiple sources when the final
  # argument is a directory, so preserve the same links with one process per PATH entry.
  if [ "${#_links[@]}" -gt 0 ]; then
    ln -s "${_links[@]}" "$SANITIZED_BIN" || {
      echo "FATAL: could not construct the sanitised plugin-test PATH" >&2
      exit 2
    }
  fi
done
export PATH="$SANITIZED_BIN"

# Fail loudly rather than run a gate that is quietly not what it claims to be.
for _cli in "${CLI_NAMES[@]}"; do
  if command -v "$_cli" > /dev/null 2>&1; then
    printf 'FATAL: %s is still on PATH at %s after sanitising\n' "$_cli" "$(command -v "$_cli")" >&2
    exit 2
  fi
done
for _needed in bun jq git bash dirname basename; do
  command -v "$_needed" > /dev/null 2>&1 || {
    printf 'FATAL: sanitising PATH lost %s\n' "$_needed" >&2
    exit 2
  }
done

failed=()

for suite in plugins/*/scripts/tests/run-tests.sh; do
  [ -f "$suite" ] || continue
  plugin="$(basename "$(dirname "$(dirname "$(dirname "$suite")")")")"
  printf '\n==> %s\n' "$plugin"

  ok=0
  bash "$suite" || ok=1

  # Only run bun tests where the plugin actually has some.
  if find "plugins/$plugin" -name '*.test.ts' -not -path '*/node_modules/*' -print -quit | grep -q .; then
    # Every Bun-tested plugin must declare an exact reproducible dependency graph. Without
    # a lockfile, imports can resolve from workstation leftovers and hide a broken checkout.
    if [ ! -f "plugins/$plugin/bun.lock" ]; then
      printf 'FATAL: %s has Bun tests but no bun.lock\n' "$plugin" >&2
      exit 1
    fi

    # Install before testing so missing dependencies cannot masquerade as source failures.
    # An install failure invalidates every later assertion, so stop immediately instead of
    # running tests against whatever physical packages happened to remain on disk.
    if ! (cd "plugins/$plugin" && bun install --frozen-lockfile); then
      printf 'FATAL: dependency installation failed for %s\n' "$plugin" >&2
      exit 1
    fi
    (cd "plugins/$plugin" && bun test .) || ok=1
  fi

  [ "$ok" -ne 0 ] && failed+=("$plugin")
done

if [ "${#failed[@]}" -gt 0 ]; then
  printf '\nFAILED: %s\n' "${failed[*]}" >&2
  exit 1
fi

# Frozen installs must also materialize the graph the manifests and locks declare. This
# postcondition catches installer/linker regressions rather than trusting a zero exit code.
if ! bash scripts/check-plugin-runtime-dependencies.sh; then
  echo "FATAL: plugin runtime dependency postcondition failed" >&2
  exit 1
fi

printf '\nAll plugin suites passed.\n'
