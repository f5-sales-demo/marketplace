#!/usr/bin/env bash

# shellcheck disable=SC1091
_load() { source "$PLUGIN_ROOT/scripts/libs/gh-poll.sh"; }

test_atomic_write_creates_file_with_exact_content() {
  _load
  dst="$GITHUB_OPS_HOME/cache/test.body"
  atomic_write "$dst" "hello world"
  [ "$(cat "$dst")" = "hello world" ] || return 1
}

test_atomic_write_overwrites_existing() {
  _load
  dst="$GITHUB_OPS_HOME/cache/test.body"
  echo "old" >"$dst"
  atomic_write "$dst" "new"
  [ "$(cat "$dst")" = "new" ] || return 1
}

test_atomic_write_leaves_no_tmp_files() {
  _load
  dst="$GITHUB_OPS_HOME/cache/test.body"
  atomic_write "$dst" "payload"
  find "$GITHUB_OPS_HOME/cache" -name 'test.body.*' | grep -q . && return 1
  return 0
}

test_cache_key_is_sha256_hex() {
  _load
  k=$(cache_key "GET" "/repos/x/y/commits/abc/check-runs")
  [ "${#k}" -eq 64 ] || return 1
  [[ "$k" =~ ^[0-9a-f]+$ ]] || return 1
}

test_cache_key_stable_for_same_input() {
  _load
  a=$(cache_key "GET" "/x")
  b=$(cache_key "GET" "/x")
  [ "$a" = "$b" ] || return 1
}

test_cache_key_differs_across_urls() {
  _load
  a=$(cache_key "GET" "/x")
  b=$(cache_key "GET" "/y")
  [ "$a" != "$b" ] || return 1
}

test_parse_status_extracts_http_code() {
  _load
  raw=$'HTTP/2.0 304\r\nETag: "abc"\r\n\r\n'
  [ "$(parse_status "$raw")" = "304" ] || return 1
}

test_parse_rate_header_returns_value() {
  _load
  raw=$'HTTP/2.0 200\r\nX-RateLimit-Remaining: 4321\r\n\r\n{}'
  [ "$(parse_rate_header "$raw" "X-RateLimit-Remaining")" = "4321" ] || return 1
}

test_parse_rate_header_case_insensitive() {
  _load
  raw=$'HTTP/2.0 200\r\nx-ratelimit-remaining: 99\r\n\r\n{}'
  [ "$(parse_rate_header "$raw" "X-RateLimit-Remaining")" = "99" ] || return 1
}

test_parse_body_separates_on_blank_line() {
  _load
  raw=$'HTTP/2.0 200\r\nETag: "z"\r\n\r\n{"ok":true}'
  [ "$(parse_body "$raw")" = '{"ok":true}' ] || return 1
}

test_parse_body_strips_cr_from_multiline_body() {
  _load
  raw=$'HTTP/2.0 200\r\nETag: "z"\r\n\r\n{\r\n  "ok": true\r\n}'
  body=$(parse_body "$raw")
  # Body must not contain any \r characters
  [[ "$body" == *$'\r'* ]] && return 1
  # And it should still contain the expected JSON content
  echo "$body" | grep -q '"ok": true' || return 1
  return 0
}

test_gh_poll_200_writes_cache() {
  _load
  export GH_STUB_STATUS=200
  export GH_STUB_ETAG='W/"v1"'
  export GH_STUB_REMAINING=4500
  export GH_STUB_RESET=$(($(date +%s) + 3600))
  export GH_STUB_BODY='{"a":1}'
  out=$(gh_poll /repos/x/y/commits/abc/check-runs)
  echo "$out" | awk -F'\t' '{exit !($1 == "200" && $4 == "etag-miss")}'
  k=$(cache_key GET /repos/x/y/commits/abc/check-runs)
  [ "$(cat "$GITHUB_OPS_HOME/cache/$k.etag")" = 'W/"v1"' ] || return 1
  [ "$(cat "$GITHUB_OPS_HOME/cache/$k.body")" = '{"a":1}' ] || return 1
}

test_gh_poll_200_body_file_contains_body() {
  _load
  export GH_STUB_STATUS=200
  export GH_STUB_BODY='{"x":42}'
  unset GH_STUB_ETAG GH_STUB_REMAINING GH_STUB_RESET
  out=$(gh_poll /repos/x/y/pulls/1)
  body_path=$(echo "$out" | awk -F'\t' '{print $5}')
  [ "$(cat "$body_path")" = '{"x":42}' ] || return 1
}

test_gh_poll_304_returns_cached_body() {
  _load
  k=$(cache_key GET /repos/x/y/commits/abc/check-runs)
  printf 'W/"v1"' >"$GITHUB_OPS_HOME/cache/$k.etag"
  printf '{"cached":true}' >"$GITHUB_OPS_HOME/cache/$k.body"
  rec="$GITHUB_OPS_HOME/gh_record"
  export GH_STUB_RECORD="$rec"
  export GH_STUB_STATUS=304
  export GH_STUB_REMAINING=4499
  out=$(gh_poll /repos/x/y/commits/abc/check-runs)
  [ "$(echo "$out" | awk -F'\t' '{print $1}')" = "304" ] || return 1
  [ "$(echo "$out" | awk -F'\t' '{print $4}')" = "etag-hit" ] || return 1
  body_path=$(echo "$out" | awk -F'\t' '{print $5}')
  [ "$(cat "$body_path")" = '{"cached":true}' ] || return 1
  grep -q -- 'If-None-Match: W/"v1"' "$rec" || return 1
}

test_gh_poll_304_does_not_rewrite_cache() {
  _load
  k=$(cache_key GET /x)
  printf 'W/"v1"' >"$GITHUB_OPS_HOME/cache/$k.etag"
  printf 'original' >"$GITHUB_OPS_HOME/cache/$k.body"
  old_mtime=$(stat -c %Y "$GITHUB_OPS_HOME/cache/$k.body")
  export GH_STUB_STATUS=304
  sleep 1
  gh_poll /x >/dev/null
  new_mtime=$(stat -c %Y "$GITHUB_OPS_HOME/cache/$k.body")
  [ "$old_mtime" = "$new_mtime" ] || return 1
}

test_gh_poll_403_primary_returns_rate_limit() {
  _load
  export GH_STUB_STATUS=403
  export GH_STUB_BODY='API rate limit exceeded for user ID 42.'
  out=$(gh_poll /x 2>&1) || true
  [ "$(echo "$out" | awk -F'\t' '{print $1}')" = "403" ] || return 1
}

test_gh_poll_429_returns_status_429() {
  _load
  export GH_STUB_STATUS=429
  export GH_STUB_RETRY_AFTER=60
  export GH_STUB_BODY='secondary rate limit'
  out=$(gh_poll /y 2>&1) || true
  [ "$(echo "$out" | awk -F'\t' '{print $1}')" = "429" ] || return 1
}

test_cache_trim_removes_stale_entries() {
  _load
  touch -d '2 days ago' "$GITHUB_OPS_HOME/cache/old.body"
  touch "$GITHUB_OPS_HOME/cache/fresh.body"
  cache_trim
  [ ! -f "$GITHUB_OPS_HOME/cache/old.body" ] || return 1
  [ -f "$GITHUB_OPS_HOME/cache/fresh.body" ] || return 1
}

test_cache_trim_respects_capacity_cap() {
  _load
  for i in $(seq 1 1010); do touch "$GITHUB_OPS_HOME/cache/f$i"; done
  cache_trim
  count=$(find "$GITHUB_OPS_HOME/cache" -maxdepth 1 -type f | wc -l)
  [ "$count" -le 1000 ] || return 1
}
