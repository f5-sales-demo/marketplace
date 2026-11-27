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
  for plugin in aws azure gcloud platform github gitlab salesforce; do
    mkdir -p "$destination/plugins/$plugin/.xcsh-plugin"
    cp "$REPO_ROOT/plugins/$plugin/.xcsh-plugin/plugin.json" "$destination/plugins/$plugin/.xcsh-plugin/plugin.json"
    cp "$REPO_ROOT/plugins/$plugin/package.json" "$destination/plugins/$plugin/package.json"
    cp "$REPO_ROOT/plugins/$plugin/bun.lock" "$destination/plugins/$plugin/bun.lock"
  done
}

GOOD="$WORK/good"
copy_runtime_state "$GOOD"
if REPO_ROOT="$GOOD" bash "$CHECK" >/dev/null; then
  pass "current runtime manifests and locks pass"
else
  fail "current runtime manifests and locks must pass"
fi

LATEST="$WORK/latest-development"
copy_runtime_state "$LATEST"
jq '.devDependencies["@f5-sales-demo/xcsh"] = "23.10.8"' \
  "$LATEST/plugins/aws/package.json" >"$LATEST/package.tmp"
mv "$LATEST/package.tmp" "$LATEST/plugins/aws/package.json"
sed 's/@f5-sales-demo\/xcsh@23\.9\.3/@f5-sales-demo\/xcsh@23.10.8/g; s/@f5-sales-demo\/pi-utils@23\.9\.3/@f5-sales-demo\/pi-utils@23.10.8/g' \
  "$LATEST/plugins/aws/bun.lock" >"$LATEST/lock.tmp"
mv "$LATEST/lock.tmp" "$LATEST/plugins/aws/bun.lock"
if REPO_ROOT="$LATEST" bash "$CHECK" >/dev/null; then
  pass "latest development pin is independent of minimum peer"
else
  fail "latest development pin must pass with original minimum peer"
fi

# The GCP lane was qualified independently; it must not admit other plugins or future pins.
UNQUALIFIED_GCP="$WORK/unqualified-gcp-development"
copy_runtime_state "$UNQUALIFIED_GCP"
jq '.devDependencies["@f5-sales-demo/xcsh"] = "25.1.2"' \
  "$UNQUALIFIED_GCP/plugins/gcloud/package.json" >"$UNQUALIFIED_GCP/package.tmp"
mv "$UNQUALIFIED_GCP/package.tmp" "$UNQUALIFIED_GCP/plugins/gcloud/package.json"
sed 's/@f5-sales-demo\/xcsh@25\.1\.1/@f5-sales-demo\/xcsh@25.1.2/g; s/@f5-sales-demo\/pi-utils@25\.1\.1/@f5-sales-demo\/pi-utils@25.1.2/g' \
  "$UNQUALIFIED_GCP/plugins/gcloud/bun.lock" >"$UNQUALIFIED_GCP/lock.tmp"
mv "$UNQUALIFIED_GCP/lock.tmp" "$UNQUALIFIED_GCP/plugins/gcloud/bun.lock"
if REPO_ROOT="$UNQUALIFIED_GCP" bash "$CHECK" >"$UNQUALIFIED_GCP/check.log" 2>&1; then
  fail "an unqualified future GCP SDK pin must fail"
fi
grep -q 'gcloud development runtime must' "$UNQUALIFIED_GCP/check.log" || fail "future GCP pin must refuse at qualification"
pass "future GCP SDK pin refuses without altering retained profiles"

FOREIGN_GCP="$WORK/foreign-gcp-development"
copy_runtime_state "$FOREIGN_GCP"
jq '.devDependencies["@f5-sales-demo/xcsh"] = "23.10.13"' \
  "$FOREIGN_GCP/plugins/aws/package.json" >"$FOREIGN_GCP/package.tmp"
mv "$FOREIGN_GCP/package.tmp" "$FOREIGN_GCP/plugins/aws/package.json"
sed 's/@f5-sales-demo\/xcsh@23\.9\.3/@f5-sales-demo\/xcsh@23.10.13/g; s/@f5-sales-demo\/pi-utils@23\.9\.3/@f5-sales-demo\/pi-utils@23.10.13/g' \
  "$FOREIGN_GCP/plugins/aws/bun.lock" >"$FOREIGN_GCP/lock.tmp"
mv "$FOREIGN_GCP/lock.tmp" "$FOREIGN_GCP/plugins/aws/bun.lock"
if REPO_ROOT="$FOREIGN_GCP" bash "$CHECK" >"$FOREIGN_GCP/check.log" 2>&1; then
  fail "the qualified GCP SDK lane must not migrate an unrelated plugin"
fi
grep -q 'aws development runtime must' "$FOREIGN_GCP/check.log" || fail "foreign GCP pin must refuse at qualification"
pass "qualified GCP SDK pin does not admit unrelated plugins"

STALE="$WORK/stale-development"
copy_runtime_state "$STALE"
jq '.devDependencies["@f5-sales-demo/xcsh"] = "23.9.2"' \
  "$STALE/plugins/aws/package.json" >"$STALE/package.tmp"
mv "$STALE/package.tmp" "$STALE/plugins/aws/package.json"
if REPO_ROOT="$STALE" bash "$CHECK" >/dev/null 2>&1; then
  fail "an unqualified intermediate development pin must fail"
else
  pass "unqualified intermediate development pin fails"
fi

CONFIGURATION="$WORK/salesforce-configuration-runtime"
copy_runtime_state "$CONFIGURATION"
jq '.minimumRuntimeVersion = "25.1.0"' \
  "$CONFIGURATION/plugins/salesforce/.xcsh-plugin/plugin.json" >"$CONFIGURATION/plugin.tmp"
mv "$CONFIGURATION/plugin.tmp" "$CONFIGURATION/plugins/salesforce/.xcsh-plugin/plugin.json"
jq '.devDependencies["@f5-sales-demo/xcsh"] = "25.1.0"
    | .devDependencies["@f5-sales-demo/pi-utils"] = "25.1.0"
    | .peerDependencies["@f5-sales-demo/xcsh"] = ">=25.1.0"
    | .peerDependencies["@f5-sales-demo/pi-utils"] = ">=25.1.0"' \
  "$CONFIGURATION/plugins/salesforce/package.json" >"$CONFIGURATION/package.tmp"
mv "$CONFIGURATION/package.tmp" "$CONFIGURATION/plugins/salesforce/package.json"
sed 's/@f5-sales-demo\/xcsh@23\.8\.0/@f5-sales-demo\/xcsh@25.1.0/g; s/@f5-sales-demo\/pi-utils@23\.8\.0/@f5-sales-demo\/pi-utils@25.1.0/g; s/@anthropic-ai\/sdk@0\.124\.0/@anthropic-ai\/sdk@1.8.0/g; s/@agentclientprotocol\/sdk@1\.4\.0/@agentclientprotocol\/sdk@2.6.0/g; s/@google\/genai@2\.21\.0/@google\/genai@3.3.0/g' \
  "$CONFIGURATION/plugins/salesforce/bun.lock" >"$CONFIGURATION/lock.tmp"
mv "$CONFIGURATION/lock.tmp" "$CONFIGURATION/plugins/salesforce/bun.lock"
if REPO_ROOT="$CONFIGURATION" bash "$CHECK" >/dev/null; then
  pass "Salesforce reviewed configuration runtime is isolated from retained plugin graphs"
else
  fail "Salesforce reviewed configuration runtime must pass without upgrading other plugins"
fi
sed 's/@agentclientprotocol\/sdk@2\.6\.0/@agentclientprotocol\/sdk@1.4.0/g' \
  "$CONFIGURATION/plugins/salesforce/bun.lock" >"$CONFIGURATION/lock.tmp"
mv "$CONFIGURATION/lock.tmp" "$CONFIGURATION/plugins/salesforce/bun.lock"
if REPO_ROOT="$CONFIGURATION" bash "$CHECK" >/dev/null 2>&1; then
  fail "Salesforce new runtime with stale ACP dependencies must fail"
else
  pass "Salesforce new runtime rejects a stale dependency graph"
fi

BAD_MANIFEST="$WORK/bad-manifest"
copy_runtime_state "$BAD_MANIFEST"
jq '.peerDependencies["@f5-sales-demo/xcsh"] = ">=1.0.0"' \
  "$BAD_MANIFEST/plugins/aws/package.json" >"$BAD_MANIFEST/package.json.tmp"
mv "$BAD_MANIFEST/package.json.tmp" "$BAD_MANIFEST/plugins/aws/package.json"
if REPO_ROOT="$BAD_MANIFEST" bash "$CHECK" >/dev/null 2>&1; then
  fail "a broad xcsh peer range must fail"
else
  pass "a broad xcsh peer range fails"
fi

OLD_PRESENTATION_API="$WORK/old-github-advisory-api"
copy_runtime_state "$OLD_PRESENTATION_API"
jq '.peerDependencies["@f5-sales-demo/xcsh"] = ">=23.3.3"' \
  "$OLD_PRESENTATION_API/plugins/github/package.json" >"$OLD_PRESENTATION_API/package.json.tmp"
mv "$OLD_PRESENTATION_API/package.json.tmp" "$OLD_PRESENTATION_API/plugins/github/package.json"
if REPO_ROOT="$OLD_PRESENTATION_API" bash "$CHECK" >/dev/null 2>&1; then
  fail "a GitHub peer range predating the presentation API must fail"
else
  pass "a GitHub peer range predating the presentation API fails"
fi

BAD_MINIMUM="$WORK/bad-minimum"
copy_runtime_state "$BAD_MINIMUM"
jq '.minimumRuntimeVersion = "99.0.0"' "$BAD_MINIMUM/plugins/salesforce/.xcsh-plugin/plugin.json" >"$BAD_MINIMUM/plugin.tmp"
mv "$BAD_MINIMUM/plugin.tmp" "$BAD_MINIMUM/plugins/salesforce/.xcsh-plugin/plugin.json"
if REPO_ROOT="$BAD_MINIMUM" bash "$CHECK" >/dev/null 2>&1; then
  fail "a runtime pin below the declared minimum must fail"
else
  pass "a runtime pin below the declared minimum fails"
fi

BAD_RUNTIME_IMPORT="$WORK/bad-runtime-import"
copy_runtime_state "$BAD_RUNTIME_IMPORT"
mkdir -p "$BAD_RUNTIME_IMPORT/plugins/github/src"
printf '%s\n' "const typebox = await import('@sinclair/typebox');" \
  >"$BAD_RUNTIME_IMPORT/plugins/github/src/runtime.ts"
if REPO_ROOT="$BAD_RUNTIME_IMPORT" bash "$CHECK" >/dev/null 2>&1; then
  fail "a plugin runtime import of a development-only package must fail"
else
  pass "a plugin runtime import of a development-only package fails"
fi

BAD_LOCK="$WORK/bad-lock"
copy_runtime_state "$BAD_LOCK"
sed 's/@anthropic-ai\/sdk@0\.124\.0/@anthropic-ai\/sdk@0.78.0/' \
  "$BAD_LOCK/plugins/azure/bun.lock" >"$BAD_LOCK/bun.lock.tmp"
mv "$BAD_LOCK/bun.lock.tmp" "$BAD_LOCK/plugins/azure/bun.lock"
if REPO_ROOT="$BAD_LOCK" bash "$CHECK" >/dev/null 2>&1; then
  fail "an obsolete provider SDK lock must fail"
else
  pass "an obsolete provider SDK lock fails"
fi

MIXED_LOCK="$WORK/mixed-lock"
copy_runtime_state "$MIXED_LOCK"
sed 's/"@anthropic-ai\/sdk@0\.124\.0"/"@anthropic-ai\/sdk@0.124.0", "@anthropic-ai\/sdk@0.78.0"/' \
  "$MIXED_LOCK/plugins/azure/bun.lock" >"$MIXED_LOCK/bun.lock.tmp"
mv "$MIXED_LOCK/bun.lock.tmp" "$MIXED_LOCK/plugins/azure/bun.lock"
if REPO_ROOT="$MIXED_LOCK" bash "$CHECK" >/dev/null 2>&1; then
  fail "mixed current and obsolete provider SDK locks must fail"
else
  pass "mixed current and obsolete provider SDK locks fail"
fi

BAD_INSTALL="$WORK/bad-install"
copy_runtime_state "$BAD_INSTALL"
mkdir -p "$BAD_INSTALL/plugins/gitlab/node_modules/@f5-sales-demo/xcsh"
printf '{"version":"19.70.1"}\n' \
  >"$BAD_INSTALL/plugins/gitlab/node_modules/@f5-sales-demo/xcsh/package.json"
if REPO_ROOT="$BAD_INSTALL" bash "$CHECK" >/dev/null 2>&1; then
  fail "a stale physical dependency installation must fail"
else
  pass "a stale physical dependency installation fails"
fi

MISSING_TYPEBOX="$WORK/missing-typebox"
copy_runtime_state "$MISSING_TYPEBOX"
AWS_NODE_MODULES="$MISSING_TYPEBOX/plugins/aws/node_modules"
mkdir -p \
  "$AWS_NODE_MODULES/@f5-sales-demo/xcsh" \
  "$AWS_NODE_MODULES/@f5-sales-demo/pi-utils" \
  "$AWS_NODE_MODULES/@anthropic-ai/sdk" \
  "$AWS_NODE_MODULES/@agentclientprotocol/sdk" \
  "$AWS_NODE_MODULES/@google/genai" \
  "$AWS_NODE_MODULES/bun-types"
printf '{"version":"23.5.1"}\n' >"$AWS_NODE_MODULES/@f5-sales-demo/xcsh/package.json"
printf '{"version":"23.5.1"}\n' >"$AWS_NODE_MODULES/@f5-sales-demo/pi-utils/package.json"
printf '{"version":"0.124.0"}\n' >"$AWS_NODE_MODULES/@anthropic-ai/sdk/package.json"
printf '{"version":"1.4.0"}\n' >"$AWS_NODE_MODULES/@agentclientprotocol/sdk/package.json"
printf '{"version":"2.21.0"}\n' >"$AWS_NODE_MODULES/@google/genai/package.json"
printf '{"version":"1.4.4"}\n' >"$AWS_NODE_MODULES/bun-types/package.json"
if REPO_ROOT="$MISSING_TYPEBOX" bash "$CHECK" >/dev/null 2>&1; then
  fail "a physical installation missing TypeBox must fail"
else
  pass "a physical installation missing TypeBox fails"
fi

# Resolve the provider used by the AI runtime, including isolated Bun graphs.
NESTED_SDK="$WORK/nested-sdk"
copy_runtime_state "$NESTED_SDK"
NESTED_MODULES="$NESTED_SDK/plugins/aws/node_modules"
cp -R "$AWS_NODE_MODULES" "$NESTED_MODULES"
mkdir -p "$NESTED_MODULES/@sinclair/typebox" "$NESTED_MODULES/@f5-sales-demo/pi-ai/node_modules/@anthropic-ai/sdk"
printf '{"version":"0.34.52"}\n' >"$NESTED_MODULES/@sinclair/typebox/package.json"
nested_runtime=$(jq -er '.devDependencies["@f5-sales-demo/xcsh"]' "$NESTED_SDK/plugins/aws/package.json")
printf '{"version":"%s"}\n' "$nested_runtime" >"$NESTED_MODULES/@f5-sales-demo/xcsh/package.json"
printf '{"version":"%s"}\n' "$nested_runtime" >"$NESTED_MODULES/@f5-sales-demo/pi-utils/package.json"
printf '{"version":"%s"}\n' "$nested_runtime" >"$NESTED_MODULES/@f5-sales-demo/pi-ai/package.json"
printf '{"version":"0.124.0"}\n' >"$NESTED_MODULES/@f5-sales-demo/pi-ai/node_modules/@anthropic-ai/sdk/package.json"
printf '{"version":"0.125.0"}\n' >"$NESTED_MODULES/@anthropic-ai/sdk/package.json"
if REPO_ROOT="$NESTED_SDK" bash "$CHECK" >/dev/null 2>&1; then
  pass "isolated AI provider dependency wins over an unrelated hoisted SDK"
else
  fail "isolated AI provider dependencies must resolve in their runtime context"
fi
printf '{"version":"0.124.0"}\n' >"$NESTED_MODULES/@anthropic-ai/sdk/package.json"
printf '{"version":"0.125.0"}\n' >"$NESTED_MODULES/@f5-sales-demo/pi-ai/node_modules/@anthropic-ai/sdk/package.json"
if REPO_ROOT="$NESTED_SDK" bash "$CHECK" >/dev/null 2>&1; then
  fail "an obsolete isolated provider must fail even when a matching SDK is hoisted"
else
  pass "an obsolete isolated provider cannot hide behind a matching hoisted SDK"
fi

mkdir -p "$BAD_INSTALL/scripts" "$BAD_INSTALL/plugins/aws/scripts/tests"
cp "$CHECK" "$BAD_INSTALL/scripts/check-plugin-runtime-dependencies.sh"
cp "$RUNNER" "$BAD_INSTALL/scripts/run-plugin-tests.sh"
cp "$REPO_ROOT/scripts/ci_gcp_test_prerequisites.py" "$BAD_INSTALL/scripts/ci_gcp_test_prerequisites.py"
mkdir -p "$BAD_INSTALL/scripts/agent-validation-runtime"
# The canonical runner now includes a real Python capture regression before Bun suites.
mkdir -p "$BAD_INSTALL/tests"
# Run the real driver guards inside this isolated repository. Each guard creates
# its own fixture, so retain its supporting driver instead of replacing checks.
cp "$REPO_ROOT/tests/test-run-plugin-tests-native-only.sh" "$BAD_INSTALL/tests/test-run-plugin-tests-native-only.sh"
cp "$REPO_ROOT/tests/test-hermetic-cli-diagnostic.sh" "$BAD_INSTALL/tests/test-hermetic-cli-diagnostic.sh"
cp "$REPO_ROOT/tests/test-hermetic-python-startup.sh" "$BAD_INSTALL/tests/test-hermetic-python-startup.sh"
cp "$REPO_ROOT/scripts/check-tests-are-hermetic.sh" "$BAD_INSTALL/scripts/check-tests-are-hermetic.sh"
cp "$REPO_ROOT/tests/test_native_capture_tools.py" "$BAD_INSTALL/tests/test_native_capture_tools.py"
cp "$REPO_ROOT/tests/test_ci_gcp_test_prerequisites.py" "$BAD_INSTALL/tests/test_ci_gcp_test_prerequisites.py"
cp "$REPO_ROOT/scripts/drive-salesforce-capture.py" "$BAD_INSTALL/scripts/drive-salesforce-capture.py"
cp "$REPO_ROOT/scripts/drive-salesforce-campaign.py" "$BAD_INSTALL/scripts/drive-salesforce-campaign.py"
cp "$REPO_ROOT/scripts/drive-salesforce-surface-capture.py" "$BAD_INSTALL/scripts/drive-salesforce-surface-capture.py"
cp "$REPO_ROOT/scripts/start-salesforce-capture.py" "$BAD_INSTALL/scripts/start-salesforce-capture.py"

cat >"$BAD_INSTALL/plugins/aws/scripts/tests/run-tests.sh" <<'EOF'
#!/usr/bin/env bash
touch "$RUNNER_TEST_MARKER"
EOF
chmod +x "$BAD_INSTALL/plugins/aws/scripts/tests/run-tests.sh"
mkdir -p "$BAD_INSTALL/test-bin"
cat >"$BAD_INSTALL/test-bin/bun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "test" ] || [ "${1:-}" = "scripts/validate-agent-permissions.ts" ]; then
  exit 0
fi
if [ "${2:-}" = "--frozen-lockfile" ] && [[ "$PWD" = */scripts/agent-validation-runtime ]]; then exit 0; fi
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
  node_modules/@google/genai \
  node_modules/@sinclair/typebox \
  node_modules/bun-types
xcsh_version=$(jq -er '.devDependencies["@f5-sales-demo/xcsh"]' package.json)
pi_utils_version="$xcsh_version"
anthropic_version="0.124.0"
acp_version="1.4.0"
google_genai_version="2.21.0"
bun_types_version="1.4.4"
if [ "$xcsh_version" = "25.1.0" ] || [ "$xcsh_version" = "25.1.1" ]; then
  anthropic_version="1.8.0"
  acp_version="2.6.0"
  google_genai_version="3.3.0"
fi
if [ "$xcsh_version" = "25.1.1" ]; then
  bun_types_version="1.4.5"
  mkdir -p node_modules/google-auth-library
  printf '{"version":"11.3.4"}\n' >node_modules/google-auth-library/package.json
fi
jq -n --arg version "$xcsh_version" '{version: $version}' >node_modules/@f5-sales-demo/xcsh/package.json
jq -n --arg version "$pi_utils_version" '{version: $version}' >node_modules/@f5-sales-demo/pi-utils/package.json
printf '{"version":"%s"}\n' "$anthropic_version" >node_modules/@anthropic-ai/sdk/package.json
printf '{"version":"%s"}\n' "$acp_version" >node_modules/@agentclientprotocol/sdk/package.json
printf '{"version":"%s"}\n' "$google_genai_version" >node_modules/@google/genai/package.json
printf '{"version":"0.34.52"}\n' >node_modules/@sinclair/typebox/package.json
printf '{"version":"%s"}\n' "$bun_types_version" >node_modules/bun-types/package.json
EOF
chmod +x "$BAD_INSTALL/test-bin/bun"
cat >"$BAD_INSTALL/scripts/run-plugin-minimum-runtime.sh" <<'EOF'
#!/usr/bin/env bash
touch "$RUNNER_MINIMUM_TEST_MARKER"
EOF
export RUNNER_MINIMUM_TEST_MARKER="$BAD_INSTALL/minimum-ran"
# This fixture verifies driver dispatch and dependency repair. Actual interpreter,
# archive and isolated actor qualification run in the separate native regressions.
fixture_python=$(command -v python3)
cat >"$BAD_INSTALL/test-bin/python3" <<'PYTHON'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  '-B scripts/ci_gcp_test_prerequisites.py verify-runtime')
    [ -f scripts/ci_gcp_test_prerequisites.py ]
    printf 'verify-runtime\n' >>"$GCP_PREREQUISITE_MARKER"
    exit "${GCP_RUNTIME_RESULT:-0}"
    ;;
  '-B -m pytest -q tests/test_ci_gcp_test_prerequisites.py')
    [ -f tests/test_ci_gcp_test_prerequisites.py ]
    [ "$CE_TEST_PYTHON_ARCHIVE" = "$GCP_SYNTHETIC_ARCHIVE" ]
    printf 'pytest\n' >>"$GCP_PREREQUISITE_MARKER"
    exit "${GCP_PYTEST_RESULT:-0}"
    ;;
esac
# Unexpected prerequisite actions may not start an archive download in this fixture.
if [[ " $* " = *' ci_gcp_test_prerequisites.py '* ]] ||
  [[ " $* " = *' scripts/ci_gcp_test_prerequisites.py '* ]]; then exit 65; fi
exec "$GCP_FIXTURE_REAL_PYTHON" "$@"
PYTHON
chmod +x "$BAD_INSTALL/test-bin/python3"
export GCP_FIXTURE_REAL_PYTHON="$fixture_python"
export GCP_PREREQUISITE_MARKER="$BAD_INSTALL/gcp-prerequisite-calls"
export GCP_SYNTHETIC_ARCHIVE="$BAD_INSTALL/synthetic-archive"
export CE_TEST_PYTHON_ARCHIVE="$GCP_SYNTHETIC_ARCHIVE"
if ! PATH="$BAD_INSTALL/test-bin:$PATH" RUNNER_TEST_MARKER="$BAD_INSTALL/suite-ran" \
  bash "$BAD_INSTALL/scripts/run-plugin-tests.sh" >"$BAD_INSTALL/runner.log" 2>&1; then
  cat "$BAD_INSTALL/runner.log" >&2
  fail "the canonical plugin runner must repair stale physical dependencies"
fi
if [ ! -e "$BAD_INSTALL/suite-ran" ]; then
  fail "the plugin runner did not continue after dependency repair"
else
  pass "the plugin runner repairs stale physical dependencies before tests"
fi

if [ ! -e "$BAD_INSTALL/minimum-ran" ]; then
  fail "the plugin runner did not execute the isolated minimum-runtime lane"
else
  pass "the plugin runner executes the isolated minimum-runtime lane"
fi
if [ "$(cat "$GCP_PREREQUISITE_MARKER")" != $'verify-runtime\npytest' ]; then
  fail "the repaired runner must invoke both exact GCP prerequisite checks"
fi
pass "dependency repair retains exact GCP prerequisite dispatch"

rm "$BAD_INSTALL/suite-ran" "$BAD_INSTALL/minimum-ran" "$GCP_PREREQUISITE_MARKER"
if PATH="$BAD_INSTALL/test-bin:$PATH" RUNNER_TEST_MARKER="$BAD_INSTALL/suite-ran" \
  GCP_RUNTIME_RESULT=19 bash "$BAD_INSTALL/scripts/run-plugin-tests.sh" >"$BAD_INSTALL/runtime-refused.log" 2>&1; then
  fail "an unavailable GCP runtime prerequisite must fail the runner"
fi
if [ -e "$BAD_INSTALL/suite-ran" ] || [ -e "$BAD_INSTALL/minimum-ran" ] || [ "$(cat "$GCP_PREREQUISITE_MARKER")" != verify-runtime ]; then
  fail "plugin suites or pytest ran after a failed GCP runtime prerequisite"
fi
pass "GCP runtime prerequisite failure prevents plugin suites and later checks"

rm "$GCP_PREREQUISITE_MARKER"
if PATH="$BAD_INSTALL/test-bin:$PATH" RUNNER_TEST_MARKER="$BAD_INSTALL/suite-ran" \
  GCP_PYTEST_RESULT=23 bash "$BAD_INSTALL/scripts/run-plugin-tests.sh" >"$BAD_INSTALL/pytest-refused.log" 2>&1; then
  fail "failing GCP prerequisite regressions must fail the runner"
fi
if [ -e "$BAD_INSTALL/suite-ran" ] || [ -e "$BAD_INSTALL/minimum-ran" ] || [ "$(cat "$GCP_PREREQUISITE_MARKER")" != $'verify-runtime\npytest' ]; then
  fail "plugin suites ran after failing GCP prerequisite regressions"
fi
pass "GCP prerequisite regression failure prevents plugin suites"
