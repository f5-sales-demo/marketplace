#!/usr/bin/env bash
# Hermetic test for scripts/release-history.sh and scripts/check-release-tags.sh — the
# record of which commit published which plugin version, and the audit that notices when
# a published version never got a tag.
#
# Every case runs against a throwaway repository built here. Never against the repository
# this test lives in: the audit walks all of history, so asserting against the real release
# record would make the test's result depend on the next release anyone cuts.
#
# The case that matters most is the shallow clone. `git log` in a depth-1 checkout reports
# almost no history, so an audit that trusted it would find nothing missing and pass —
# green, and blind. That is the failure this whole file exists to make impossible.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
HISTORY="${REPO_ROOT}/scripts/release-history.sh"
AUDIT="${REPO_ROOT}/scripts/check-release-tags.sh"

MANIFEST=".xcsh-plugin/marketplace.json"

FAIL=0
WORK=$(mktemp -d)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Each fixture gets its own directory from mktemp, not a counter. A counter incremented
# inside `$(new_repo)` increments in a subshell and is lost, so every fixture would land in
# one directory and inherit the previous case's commits and tags — the tests would still
# report OK, against a history nobody wrote.
new_repo() {
  local dir
  dir=$(mktemp -d "${WORK}/repo-XXXXXX")
  mkdir -p "${dir}/.xcsh-plugin"
  git -C "$dir" init -q -b main
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name "Test"
  git -C "$dir" config commit.gpgsign false
  printf '%s\n' "$dir"
}

# commit_manifest <dir> <name=version>... — writes the manifest and prints the new sha.
commit_manifest() {
  local dir="$1"
  shift
  local json='{"plugins":[' first=1 pair
  for pair in "$@"; do
    [ "$first" -eq 1 ] || json+=','
    first=0
    json+="{\"name\":\"${pair%%=*}\",\"version\":\"${pair#*=}\"}"
  done
  json+=']}'
  printf '%s\n' "$json" >"${dir}/${MANIFEST}"
  git -C "$dir" add -A
  # --allow-empty is deliberately NOT passed: a case that meant to change the manifest and
  # did not is a broken fixture, and `git commit` refusing is how it says so.
  git -C "$dir" commit -qm "manifest: $*"
  git -C "$dir" rev-parse HEAD
}

# A refusal must be a refusal, not a crash. `bash missing-script.sh` exits 127, which would
# satisfy a bare `rc -ne 0` and let every "refuses" case pass before the script was written.
assert_refused() {
  local label="$1" rc="$2" out="$3" want_match="${4:-}"
  if [ "$rc" -ne 1 ]; then
    bad "${label} — expected exit 1, got ${rc}"
    printf '       output: %s\n' "$out"
    return
  fi
  if [ -n "$want_match" ] && ! printf '%s' "$out" | grep -qi -- "$want_match"; then
    bad "${label} — exit 1 but the reason never mentioned '${want_match}'"
    printf '       output: %s\n' "$out"
    return
  fi
  ok "$label"
}

# commit_other <dir> — a commit that does not touch the manifest.
commit_other() {
  local dir="$1"
  printf 'x %s\n' "$RANDOM" >>"${dir}/README.md"
  git -C "$dir" add -A
  git -C "$dir" commit -qm "unrelated"
  git -C "$dir" rev-parse HEAD
}

ok() {
  printf '[OK] %s\n' "$1"
}
bad() {
  printf '[FAIL] %s\n' "$1"
  FAIL=1
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    ok "$label"
  else
    bad "$label"
    printf '       expected: %s\n' "$(printf '%s' "$expected" | tr '\n' '|')"
    printf '       actual:   %s\n' "$(printf '%s' "$actual" | tr '\n' '|')"
  fi
}

# Runs a script inside a fixture repo and prints its stdout. Fails the test on non-zero.
run_in() {
  local dir="$1" script="$2"
  shift 2
  (cd "$dir" && bash "$script" "$@")
}

# ---------------------------------------------------------------------------
# release-history.sh — what was published, and by which commit
# ---------------------------------------------------------------------------

# Three bumps of one plugin, oldest first, each attributed to its own commit.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
b=$(commit_manifest "$d" demo=1.1.0)
c=$(commit_manifest "$d" demo=2.0.0)
assert_eq "three bumps listed oldest first, each with its publishing commit" \
  "demo 1.0.0 ${a}
demo 1.1.0 ${b}
demo 2.0.0 ${c}" \
  "$(run_in "$d" "$HISTORY")"

# A commit that rewrites the manifest without changing any version publishes nothing.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
printf '%s\n' '{"plugins":[{"name":"demo","version":"1.0.0","description":"new"}]}' >"${d}/${MANIFEST}"
git -C "$d" add -A && git -C "$d" commit -qm "description only"
assert_eq "a manifest edit that changes no version publishes nothing" \
  "demo 1.0.0 ${a}" \
  "$(run_in "$d" "$HISTORY")"

# Two plugins bumped in one commit are two releases at the same sha.
d=$(new_repo)
a=$(commit_manifest "$d" alpha=1.0.0 beta=1.0.0)
assert_eq "two plugins bumped in one commit are two releases at that commit" \
  "alpha 1.0.0 ${a}
beta 1.0.0 ${a}" \
  "$(run_in "$d" "$HISTORY")"

# A plugin added later is published at the commit that added it.
d=$(new_repo)
a=$(commit_manifest "$d" alpha=1.0.0)
b=$(commit_manifest "$d" alpha=1.0.0 beta=0.1.0)
assert_eq "a plugin added later is published at the commit that added it" \
  "alpha 1.0.0 ${a}
beta 0.1.0 ${b}" \
  "$(run_in "$d" "$HISTORY")"

# Removing a plugin publishes nothing and does not retract what it already published.
d=$(new_repo)
a=$(commit_manifest "$d" alpha=1.0.0 beta=1.0.0)
commit_manifest "$d" alpha=1.0.0 >/dev/null
assert_eq "removing a plugin publishes nothing and retracts nothing" \
  "alpha 1.0.0 ${a}
beta 1.0.0 ${a}" \
  "$(run_in "$d" "$HISTORY")"

# A version that reappears after a downgrade was published once, by the earlier commit.
# It can only ever carry one tag, so the later appearance is not a second release.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
b=$(commit_manifest "$d" demo=2.0.0)
commit_manifest "$d" demo=1.0.0 >/dev/null
assert_eq "a version reappearing after a downgrade is still one release, the earlier one" \
  "demo 1.0.0 ${a}
demo 2.0.0 ${b}" \
  "$(run_in "$d" "$HISTORY")"

# Commits before the manifest existed are not an error.
d=$(new_repo)
commit_other "$d" >/dev/null
a=$(commit_manifest "$d" demo=1.0.0)
assert_eq "history predating the manifest is not an error" \
  "demo 1.0.0 ${a}" \
  "$(run_in "$d" "$HISTORY")"

# The manifest has been renamed once already — .claude-plugin/marketplace.json became
# .xcsh-plugin/marketplace.json in e4723c3. A path-limited log that knows only the new name
# stops dead at the rename: 57 commits of real release history become invisible and every
# version that existed at the rename is attributed to the rename commit, so a re-cut would
# tag a refactor instead of the release.
d=$(new_repo)
mkdir -p "${d}/.claude-plugin"
printf '%s\n' '{"plugins":[{"name":"demo","version":"1.0.0"}]}' >"${d}/.claude-plugin/marketplace.json"
git -C "$d" add -A && git -C "$d" commit -qm "old path 1.0.0"
old_a=$(git -C "$d" rev-parse HEAD)
printf '%s\n' '{"plugins":[{"name":"demo","version":"1.1.0"}]}' >"${d}/.claude-plugin/marketplace.json"
git -C "$d" add -A && git -C "$d" commit -qm "old path 1.1.0"
old_b=$(git -C "$d" rev-parse HEAD)
git -C "$d" mv .claude-plugin/marketplace.json .xcsh-plugin/marketplace.json
git -C "$d" commit -qm "rename the manifest"
after=$(commit_manifest "$d" demo=2.0.0)
assert_eq "a manifest rename does not truncate or re-attribute the history" \
  "demo 1.0.0 ${old_a}
demo 1.1.0 ${old_b}
demo 2.0.0 ${after}" \
  "$(run_in "$d" "$HISTORY")"

# Lookup mode: the publishing commit for one version, and a refusal for one never published.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
b=$(commit_manifest "$d" demo=1.1.0)
assert_eq "lookup returns the publishing commit" "$b" "$(run_in "$d" "$HISTORY" demo 1.1.0)"
assert_eq "lookup returns the publishing commit for an older version" \
  "$a" "$(run_in "$d" "$HISTORY" demo 1.0.0)"

rc=0
out=$( (cd "$d" && bash "$HISTORY" demo 9.9.9 2>&1)) || rc=$?
assert_refused "lookup refuses a version that was never on main" "$rc" "$out" "9.9.9"

rc=0
out=$( (cd "$d" && bash "$HISTORY" nosuch 1.0.0 2>&1)) || rc=$?
assert_refused "lookup refuses an unknown plugin" "$rc" "$out" "nosuch"

# ---------------------------------------------------------------------------
# The shallow clone — the case that would make every audit vacuous
# ---------------------------------------------------------------------------

d=$(new_repo)
commit_manifest "$d" demo=1.0.0 >/dev/null
commit_manifest "$d" demo=2.0.0 >/dev/null
commit_manifest "$d" demo=3.0.0 >/dev/null
shallow="${WORK}/shallow"
git clone -q --depth 1 "file://${d}" "$shallow" 2>/dev/null

rc=0
out=$( (cd "$shallow" && bash "$HISTORY" 2>&1)) || rc=$?
assert_refused "release-history refuses a shallow clone instead of under-reporting" \
  "$rc" "$out" "shallow"

rc=0
out=$( (cd "$shallow" && bash "$AUDIT" 2>&1)) || rc=$?
assert_refused "the audit refuses a shallow clone instead of passing blind" \
  "$rc" "$out" "shallow"

# ---------------------------------------------------------------------------
# check-release-tags.sh — every published version must carry a tag
# ---------------------------------------------------------------------------

# All tagged: clean.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
b=$(commit_manifest "$d" demo=1.1.0)
git -C "$d" tag "demo/v1.0.0" "$a"
git -C "$d" tag "demo/v1.1.0" "$b"
commit_other "$d" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -eq 0 ]; then
  ok "the audit passes when every published version carries a tag"
else
  bad "the audit failed on a fully tagged history (exit ${rc})"
  printf '       output: %s\n' "$out"
fi

# The v7.2.0 case: a version published, never tagged, and a later version tagged over it.
# Auditing only the current manifest would call this clean, which is exactly how the real
# one stayed invisible until someone went looking for the tag.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
b=$(commit_manifest "$d" demo=1.1.0)
c=$(commit_manifest "$d" demo=1.2.0)
git -C "$d" tag "demo/v1.0.0" "$a"
git -C "$d" tag "demo/v1.2.0" "$c"
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'demo/v1.1.0'; then
  ok "the audit names a version that was skipped and superseded (exit ${rc})"
else
  bad "the audit missed a published version with no tag"
  printf '       output: %s\n' "$out"
fi
if printf '%s' "$out" | grep -q "$b"; then
  ok "the audit reports the commit that published the untagged version"
else
  bad "the audit did not say which commit published the untagged version"
fi

# A version published by the tip commit is still being released; the release job runs
# alongside this audit, so demanding its tag would fail on every legitimate release.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
git -C "$d" tag "demo/v1.0.0" "$a"
commit_manifest "$d" demo=1.1.0 >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -eq 0 ]; then
  ok "a version published by the tip commit is in flight, not missing"
else
  bad "the audit failed a release that is still in flight (exit ${rc})"
  printf '       output: %s\n' "$out"
fi

# ...but only for the tip. One commit later, the same untagged version is a real gap.
commit_other "$d" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'demo/v1.1.0'; then
  ok "once the tip moves on, the untagged version is reported (exit ${rc})"
else
  bad "the audit stayed quiet about an untagged version after the tip moved on"
  printf '       output: %s\n' "$out"
fi

# A plugin the marketplace no longer offers is out of scope. Five f5xc-* plugins were
# renamed away in the org rename and never tagged at v1.0.0; nobody can install them, so
# there is no release to re-cut and reporting them would leave main permanently red with
# nothing actionable in it. Versions of plugins still on offer are unaffected — which is
# what keeps the meddpicc/v7.2.0 case above reportable.
d=$(new_repo)
commit_manifest "$d" old=1.0.0 >/dev/null
b=$(commit_manifest "$d" old=1.0.0 keep=1.0.0)
git -C "$d" tag "keep/v1.0.0" "$b"
commit_manifest "$d" keep=1.0.0 >/dev/null
commit_other "$d" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -eq 0 ] && ! printf '%s' "$out" | grep -q 'old/v1.0.0'; then
  ok "a version of a plugin no longer offered is out of scope"
else
  bad "the audit reported a withdrawn plugin (exit ${rc}) — nothing to re-cut, permanently red"
  printf '       output: %s\n' "$out"
fi
if printf '%s' "$out" | grep -qi 'withdrawn\|no longer'; then
  ok "the audit says what it skipped rather than skipping silently"
else
  bad "the audit skipped a withdrawn plugin without saying so"
  printf '       output: %s\n' "$out"
fi
# ...and the plugin that IS still offered is still audited: same fixture, tag removed.
git -C "$d" tag -d "keep/v1.0.0" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
assert_refused "a still-offered plugin is audited across its whole history" "$rc" "$out" "keep/v1.0.0"

# A tag that exists but points somewhere else is worse than a missing one: it looks
# released, and whoever installs it gets a different revision than the version claims. The
# old workflow tagged `main` rather than the publishing commit, so this was reachable
# whenever main moved between the merge and the release job. All 80 in-scope tags happen to
# be correct today, which is exactly why the check is cheap to start enforcing now.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
b=$(commit_manifest "$d" demo=2.0.0)
git -C "$d" tag "demo/v1.0.0" "$a"
git -C "$d" tag "demo/v2.0.0" "$a" # wrong: v2.0.0 was published by $b
commit_other "$d" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'demo/v2.0.0'; then
  ok "a tag pointing at the wrong commit is reported (exit ${rc})"
else
  bad "the audit accepted a tag that points at the wrong commit"
  printf '       output: %s\n' "$out"
fi
if printf '%s' "$out" | grep -q "${b:0:9}"; then
  ok "the mispointed-tag report names the commit the tag should be on"
else
  bad "the mispointed-tag report did not name the correct commit"
  printf '       output: %s\n' "$out"
fi

# An annotated tag counts. The workflow creates lightweight ones, but a hand-cut release
# — which is how meddpicc/v7.2.0 was finally published — can be either.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
git -C "$d" tag -a "demo/v1.0.0" -m "hand cut" "$a"
commit_other "$d" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
if [ "$rc" -eq 0 ]; then
  ok "an annotated tag satisfies the audit"
else
  bad "the audit rejected an annotated tag (exit ${rc})"
  printf '       output: %s\n' "$out"
fi

# A tag whose name merely contains the version does not count for it.
d=$(new_repo)
a=$(commit_manifest "$d" demo=1.0.0)
git -C "$d" tag "demo/v1.0.0-rc1" "$a"
commit_other "$d" >/dev/null
rc=0
out=$(run_in "$d" "$AUDIT" 2>&1) || rc=$?
assert_refused "a prerelease tag does not satisfy the release it resembles" \
  "$rc" "$out" "demo/v1.0.0"

if [ "$FAIL" -ne 0 ]; then
  printf '\nFAILED\n'
  exit 1
fi
printf '\nAll release-history tests passed.\n'
