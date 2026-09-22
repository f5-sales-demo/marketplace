#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
export HOME="$root/home"
mkdir -p "$HOME"

installer=$(cd "$(dirname "$0")/../scripts" && pwd)/install-unix.sh
sh "$installer" apply 1.1.1
sh "$installer" verify 1.1.1
second=$(sh "$installer" apply 1.1.1)
grep -F 'already installed' <<<"$second"

receipt="$HOME/.local/state/xcsh/herdr/setup-receipt.json"
binary="$HOME/.local/bin/herdr"
test -f "$receipt"
test -x "$binary"
expected=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["sha256"])' "$receipt")
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$binary" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$binary" | awk '{print $1}')
fi
test "$actual" = "$expected"
printf 'Unix Herdr live smoke passed: %s\n' "$($binary --version)"
