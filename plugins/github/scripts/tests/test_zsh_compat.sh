#!/usr/bin/env bash
# Shell-portability smoke tests for the github-ops libs.
#
# The libs are bash scripts but they are `source`d, not executed, so
# their shebang is advisory. When the calling shell is zsh, any
# `local status=...` assignment triggers "read-only variable: status"
# because zsh exposes $status as a readonly alias for $?.
#
# These tests shell out to zsh and assert that the libs run clean.

ZSH_BIN="$(command -v zsh 2>/dev/null || true)"

_skip_if_no_zsh() {
  if [ -z "$ZSH_BIN" ]; then
    echo "SKIP: zsh not installed"
    return 0
  fi
  return 1
}

test_retry_with_backoff_runs_clean_in_zsh() {
  _skip_if_no_zsh && return 0
  local out
  out=$(GITHUB_OPS_LIB="$GITHUB_OPS_LIB" GITHUB_OPS_HOME="$GITHUB_OPS_HOME" \
    "$ZSH_BIN" -c '
      source "$GITHUB_OPS_LIB/retry.sh"
      retry_with_backoff 429 30 https://example.com/api
    ' 2>&1 || true)
  if echo "$out" | grep -q 'read-only'; then
    echo "zsh readonly error: $out"
    return 1
  fi
  echo "$out" | grep -q 'http_status=429' || {
    echo "expected http_status=429 in stderr output, got: $out"
    return 1
  }
}

test_gh_poll_runs_clean_in_zsh() {
  _skip_if_no_zsh && return 0
  local out
  out=$(PATH="$PATH" GITHUB_OPS_LIB="$GITHUB_OPS_LIB" GITHUB_OPS_HOME="$GITHUB_OPS_HOME" \
    STUB_STATUS=200 STUB_ETAG='"abc"' STUB_BODY='{"check_runs":[]}' \
    "$ZSH_BIN" -c '
      source "$GITHUB_OPS_LIB/gh-poll.sh"
      gh_poll "/repos/foo/bar/commits/abc/check-runs" >/dev/null
    ' 2>&1 || true)
  if echo "$out" | grep -q 'read-only'; then
    echo "zsh readonly error: $out"
    return 1
  fi
}
