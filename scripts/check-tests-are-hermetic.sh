#!/usr/bin/env bash
# check-tests-are-hermetic.sh — prove no plugin test depends on a real cloud CLI.
#
# The plugin suites twice broke CI for the same reason: a test called a tool's `execute`,
# the tool built its own executor from `ctx.cwd`, and the real `az` / `aws` / `sf` ran. On a
# developer Mac the binary answers fast and the test passes; on a runner it is slower, or
# absent, and the test fails or — worse — writes to the developer's own CLI config. Reading
# the diff does not catch this. Making the CLIs slow does.
#
# Every cloud CLI is replaced with a stub that sleeps. Any test that still spawns one blocks
# and trips bun's 5 s per-test timeout, naming itself in the output. Tests that legitimately
# drive a CLI are gated on its presence and carry an explicit longer timeout, so they
# tolerate the stub.
#
# The sleep is deliberately shorter than those explicit timeouts and longer than the default.
#
# Two limits worth stating. It only covers the bun suites: the shell suites have no
# per-test timeout, so a sleeping stub would not reveal anything there, only make the run
# take minutes. And a fire-and-forget spawn — one the test never awaits — does not block, so
# it slips through. Neither is load-bearing, because `run-plugin-tests.sh` removes the cloud
# CLIs from PATH altogether: this script is the diagnostic that names an offending test,
# not the thing that stops one reaching a CLI.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

SLEEP_SECONDS="${HERMETIC_SLEEP_SECONDS:-8}"
CLIS=(aws az gcloud gh glab sf)

command -v bun >/dev/null 2>&1 || {
  echo "FATAL: bun is required" >&2
  exit 2
}

STUB_BIN="$(mktemp -d)"
trap 'rm -rf "$STUB_BIN"' EXIT

# Keep only what the suites genuinely need; everything else resolves from /usr/bin and /bin.
for tool in bun jq git node npm; do
  path="$(command -v "$tool" 2>/dev/null)" && ln -sf "$path" "$STUB_BIN/$tool"
done

for cli in "${CLIS[@]}"; do
  printf '#!/bin/sh\nsleep %s\n' "$SLEEP_SECONDS" >"$STUB_BIN/$cli"
  chmod +x "$STUB_BIN/$cli"
done

failed=()

for dir in plugins/*/; do
  plugin="$(basename "$dir")"
  find "$dir" -name '*.test.ts' -not -path '*/node_modules/*' -print -quit | grep -q . || continue

  printf '\n==> %s\n' "$plugin"
  if ! (cd "$dir" && PATH="$STUB_BIN:/usr/bin:/bin" bun test .); then
    failed+=("$plugin")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  cat >&2 <<EOF

NOT HERMETIC: ${failed[*]}

A test above spawned a real cloud CLI. Either:
  - it is a unit test, and should take an injected executor —
    createXTool(pi, () => ({ exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }) }))
  - or it genuinely drives the CLI, and belongs behind a presence gate
    (it.skipIf(!CLI_INSTALLED)) with an explicit timeout longer than ${SLEEP_SECONDS}s.
EOF
  exit 1
fi

printf '\nNo plugin test depends on a real cloud CLI.\n'
