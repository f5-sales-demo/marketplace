#!/usr/bin/env bash
set -euo pipefail
python3 -m unittest discover -s "$(dirname "$0")" -p 'test_*.py'
