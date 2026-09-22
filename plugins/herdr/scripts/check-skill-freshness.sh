#!/usr/bin/env bash
set -euo pipefail

vendored=${1:?vendored directory required}
upstream=${2:?upstream directory required}

test -d "$vendored"
test -d "$upstream"
diff -ruN --exclude='.DS_Store' "$upstream" "$vendored"
