#!/usr/bin/env bash
# Mock az CLI that returns fixture data based on MOCK_AZ_FIXTURE env var.
# The fixture file path is set by the benchmark runner before invoking tools.
if [ -n "$MOCK_AZ_FIXTURE" ] && [ -f "$MOCK_AZ_FIXTURE" ]; then
  cat "$MOCK_AZ_FIXTURE"
  exit 0
fi

# If MOCK_AZ_HELP is set, return help text
if [ -n "$MOCK_AZ_HELP" ]; then
  echo "$MOCK_AZ_HELP"
  exit 0
fi

# Fallback: no fixture set, error
echo "mock-az: no MOCK_AZ_FIXTURE or MOCK_AZ_HELP set" >&2
exit 1
