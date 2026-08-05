#!/usr/bin/env bash

test_harness_stub_returns_configured_status() {
  export GH_STUB_STATUS=304
  out=$(gh api -i /foo 2>&1)
  echo "$out" | grep -q '^HTTP/2.0 304' || return 1
}

test_harness_records_invocation() {
  rec="$GITHUB_OPS_HOME/gh_record"
  export GH_STUB_RECORD="$rec"
  export GH_STUB_STATUS=200
  export GH_STUB_BODY='{"ok":true}'
  gh api -i /bar >/dev/null
  grep -q -- '-i /bar' "$rec" || return 1
}
