#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHECK="$REPO_ROOT/scripts/check-plugin-runtime-dependencies.sh"
RUNNER="$REPO_ROOT/scripts/run-plugin-tests.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

copy_runtime_state() {
  local destination="$1"
  mkdir -p "$destination/plugins"
  for plugin in aws azure gcloud github gitlab salesforce; do
    mkdir -p "$destination/plugins/$plugin"
    cp "$REPO_ROOT/plugins/$plugin/package.json" "$destination/plugins/$plugin/package.json"
    cp "$REPO_ROOT/plugins/$plugin/bun.lock" "$destination/plugins/$plugin/bun.lock"
  done
}

GOOD="$WORK/good"
copy_runtime_state "$GOOD"
if REPO_ROOT="$GOOD" bash "$CHECK" > /dev/null; then
  pass "current runtime manifests and locks pass"
else
  fail "current runtime manifests and locks must pass"
fi

BAD_MANIFEST="$WORK/bad-manifest"
copy_runtime_state "$BAD_MANIFEST"
jq '.peerDependencies["@f5-sales-demo/xcsh"] = ">=1.0.0"' \
  "$BAD_MANIFEST/plugins/aws/package.json" > "$BAD_MANIFEST/package.json.tmp"
mv "$BAD_MANIFEST/package.json.tmp" "$BAD_MANIFEST/plugins/aws/package.json"
if REPO_ROOT="$BAD_MANIFEST" bash "$CHECK" > /dev/null 2>&1; then
  fail "a broad xcsh peer range must fail"
else
  pass "a broad xcsh peer range fails"
fi

BAD_LOCK="$WORK/bad-lock"
copy_runtime_state "$BAD_LOCK"
sed 's/@anthropic-ai\/sdk@0\.115\.0/@anthropic-ai\/sdk@0.78.0/' \
  "$BAD_LOCK/plugins/azure/bun.lock" > "$BAD_LOCK/bun.lock.tmp"
mv "$BAD_LOCK/bun.lock.tmp" "$BAD_LOCK/plugins/azure/bun.lock"
if REPO_ROOT="$BAD_LOCK" bash "$CHECK" > /dev/null 2>&1; then
  fail "an obsolete provider SDK lock must fail"
else
  pass "an obsolete provider SDK lock fails"
fi

MIXED_LOCK="$WORK/mixed-lock"
copy_runtime_state "$MIXED_LOCK"
sed 's/"@anthropic-ai\/sdk@0\.115\.0"/"@anthropic-ai\/sdk@0.115.0", "@anthropic-ai\/sdk@0.78.0"/' \
  "$MIXED_LOCK/plugins/azure/bun.lock" > "$MIXED_LOCK/bun.lock.tmp"
mv "$MIXED_LOCK/bun.lock.tmp" "$MIXED_LOCK/plugins/azure/bun.lock"
if REPO_ROOT="$MIXED_LOCK" bash "$CHECK" > /dev/null 2>&1; then
  fail "mixed current and obsolete provider SDK locks must fail"
else
  pass "mixed current and obsolete provider SDK locks fail"
fi

BAD_INSTALL="$WORK/bad-install"
copy_runtime_state "$BAD_INSTALL"
mkdir -p "$BAD_INSTALL/plugins/gitlab/node_modules/@f5-sales-demo/xcsh"
printf '{"version":"19.70.1"}\n' \
  > "$BAD_INSTALL/plugins/gitlab/node_modules/@f5-sales-demo/xcsh/package.json"
if REPO_ROOT="$BAD_INSTALL" bash "$CHECK" > /dev/null 2>&1; then
  fail "a stale physical dependency installation must fail"
else
  pass "a stale physical dependency installation fails"
fi

mkdir -p "$BAD_INSTALL/scripts" "$BAD_INSTALL/plugins/aws/scripts/tests"
cp "$CHECK" "$BAD_INSTALL/scripts/check-plugin-runtime-dependencies.sh"
cp "$RUNNER" "$BAD_INSTALL/scripts/run-plugin-tests.sh"
cat > "$BAD_INSTALL/plugins/aws/scripts/tests/run-tests.sh" << 'EOF'
#!/usr/bin/env bash
touch "$RUNNER_TEST_MARKER"
EOF
chmod +x "$BAD_INSTALL/plugins/aws/scripts/tests/run-tests.sh"
mkdir -p "$BAD_INSTALL/test-bin"
cat > "$BAD_INSTALL/test-bin/bun" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ "${PUPPETEER_SKIP_DOWNLOAD:-}" = "1" ]
[ "${1:-}" = "install" ]
case " $* " in
  *" --force "*) ;;
  *) exit 2 ;;
esac
case " $* " in
  *" --frozen-lockfile "*) ;;
  *) exit 2 ;;
esac
mkdir -p \
  node_modules/@f5-sales-demo/xcsh \
  node_modules/@f5-sales-demo/pi-utils \
  node_modules/@anthropic-ai/sdk \
  node_modules/@agentclientprotocol/sdk \
  node_modules/@google/genai
printf '{"version":"20.2.7"}\n' >node_modules/@f5-sales-demo/xcsh/package.json
printf '{"version":"20.2.7"}\n' >node_modules/@f5-sales-demo/pi-utils/package.json
printf '{"version":"0.115.0"}\n' >node_modules/@anthropic-ai/sdk/package.json
printf '{"version":"1.3.0"}\n' >node_modules/@agentclientprotocol/sdk/package.json
printf '{"version":"2.15.0"}\n' >node_modules/@google/genai/package.json
EOF
chmod +x "$BAD_INSTALL/test-bin/bun"
if ! PATH="$BAD_INSTALL/test-bin:$PATH" RUNNER_TEST_MARKER="$BAD_INSTALL/suite-ran" \
  bash "$BAD_INSTALL/scripts/run-plugin-tests.sh" > "$BAD_INSTALL/runner.log" 2>&1; then
  cat "$BAD_INSTALL/runner.log" >&2
  fail "the canonical plugin runner must repair stale physical dependencies"
fi
if [ ! -e "$BAD_INSTALL/suite-ran" ]; then
  fail "the plugin runner did not continue after dependency repair"
else
  pass "the plugin runner repairs stale physical dependencies before tests"
fi
