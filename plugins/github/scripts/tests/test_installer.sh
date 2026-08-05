#!/usr/bin/env bash

_install() {
  bash "$PLUGIN_ROOT/scripts/install-github-ops-lib.sh"
}

test_installer_creates_runtime_dirs() {
  _install
  [ -d "$GITHUB_OPS_HOME/lib" ] || return 1
  [ -d "$GITHUB_OPS_HOME/cache" ] || return 1
  [ -d "$GITHUB_OPS_HOME/state" ] || return 1
}

test_installer_copies_three_libs() {
  _install
  [ -x "$GITHUB_OPS_HOME/lib/gh-poll.sh" ] || return 1
  [ -x "$GITHUB_OPS_HOME/lib/budget.sh" ] || return 1
  [ -x "$GITHUB_OPS_HOME/lib/retry.sh" ] || return 1
}

test_installer_is_idempotent() {
  _install
  _install
  count=$(find "$GITHUB_OPS_HOME/lib" -type f | wc -l)
  [ "$count" -eq 3 ] || return 1
}

test_installer_atomic_rename_no_partial_files() {
  _install
  find "$GITHUB_OPS_HOME/lib" -name '*.XXXXXX*' -o -name 'tmp.*' | grep -q . && return 1
  return 0
}
