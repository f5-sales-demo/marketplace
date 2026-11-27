#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo "Both complete test-pass results are required." >&2
  exit 64
fi
if [[ "$1" != success || "$2" != success ]]; then
  echo "The main and cloud-CLI independence passes must both succeed." >&2
  exit 1
fi
echo "Both complete plugin test passes succeeded."
