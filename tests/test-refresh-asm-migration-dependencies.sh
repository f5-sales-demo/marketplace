#!/usr/bin/env bash
# Hermetic coverage for Renovate's ASM Migration release-refresh command.
set -euo pipefail

SOURCE_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRIPT="$SOURCE_ROOT/scripts/refresh-asm-migration-dependencies.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}
pass() { echo "PASS: $1"; }

new_repo() {
  local root="$WORK/$1"
  mkdir -p "$root/scripts" "$root/plugins/asm-migration/.xcsh-plugin" \
    "$root/plugins/asm-migration/dist" "$root/.xcsh-plugin" "$root/bin"
  cp "$SCRIPT" "$root/scripts/refresh-asm-migration-dependencies.sh"
  cp "$SOURCE_ROOT/scripts/bump-version.sh" "$root/scripts/bump-version.sh"
  cat >"$root/plugins/asm-migration/package.json" <<'JSON'
{"name":"asm-migration","version":"2.0.8","xcsh":{"version":"2.0.8"},"devDependencies":{"fast-xml-parser":"5.11.0"}}
JSON
  printf '{"lockfileVersion":1}\n' >"$root/plugins/asm-migration/bun.lock"
  printf '{"name":"asm-migration","version":"2.0.8"}\n' >"$root/plugins/asm-migration/.xcsh-plugin/plugin.json"
  printf '{"plugins":[{"name":"asm-migration","version":"2.0.8"}]}\n' >"$root/.xcsh-plugin/marketplace.json"
  printf '# Changelog\n\n## [Unreleased]\n\n## [1.0.0]\n' >"$root/CHANGELOG.md"
  printf '#!/usr/bin/env bash\nset -euo pipefail\nprintf "%%s\\n" "$*" >>"$TEST_STATE/bun-calls"\nif [[ "$1" == install ]]; then exit 0; fi\nprintf "runtime rebuilt\\n" > dist/runtime.js\n' >"$root/bin/bun"
  chmod +x "$root/bin/bun" "$root/scripts/refresh-asm-migration-dependencies.sh" "$root/scripts/bump-version.sh"
  git -C "$root" init -q -b main
  git -C "$root" config user.email refresh@test
  git -C "$root" config user.name 'Refresh Test'
  git -C "$root" add .
  git -C "$root" commit -qm baseline
  printf '%s\n' "$root"
}

repo=$(new_repo noop)
mkdir -p "$repo/state"
PATH="$repo/bin:$PATH" TEST_STATE="$repo/state" REPO_ROOT="$repo" bash "$repo/scripts/refresh-asm-migration-dependencies.sh"
if [ -e "$repo/state/bun-calls" ] || ! git -C "$repo" diff --quiet; then
  fail 'unrelated updates must not invoke Bun or modify release files'
fi
pass 'no-op path leaves the repository unchanged'

repo=$(new_repo asm-change)
mkdir -p "$repo/state"
sed -i 's/5.11.0/5.11.1/' "$repo/plugins/asm-migration/package.json"
printf 'updated lock\n' >"$repo/plugins/asm-migration/bun.lock"
PATH="$repo/bin:$PATH" TEST_STATE="$repo/state" REPO_ROOT="$repo" bash "$repo/scripts/refresh-asm-migration-dependencies.sh"

calls=$(wc -l <"$repo/state/bun-calls" | tr -d ' ')
[ "$calls" = 2 ] || fail "expected frozen install and one build, got $calls Bun calls"
grep -Fx 'install --frozen-lockfile' "$repo/state/bun-calls" >/dev/null || fail 'refresh must use frozen install'
grep -Fx 'run build' "$repo/state/bun-calls" >/dev/null || fail 'refresh must rebuild runtime'
[ "$(jq -r .version "$repo/plugins/asm-migration/package.json")" = 2.0.9 ] || fail 'package version was not bumped once'
[ "$(jq -r .version "$repo/plugins/asm-migration/.xcsh-plugin/plugin.json")" = 2.0.9 ] || fail 'plugin manifest was not refreshed'
[ "$(jq -r '.plugins[0].version' "$repo/.xcsh-plugin/marketplace.json")" = 2.0.9 ] || fail 'marketplace manifest was not refreshed'
test -s "$repo/plugins/asm-migration/dist/runtime.js" || fail 'runtime was not generated'
grep -Fq 'bumped to v2.0.9' "$repo/CHANGELOG.md" || fail 'changelog was not refreshed'
pass 'ASM update rebuilds generated artifacts and performs exactly one patch release'
