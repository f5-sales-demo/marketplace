#!/usr/bin/env bash
# Exercise the actual copied driver with mocked suites and a real Python venv.
set -euo pipefail

test_repo_root=$(cd "$(dirname "$0")/.." && pwd)
fixture_root=$(mktemp -d)
trap 'rm -rf "$fixture_root"' EXIT
fixture_python="${CE_TEST_PYTHON:-$(command -v python3)}"
# A relocated standalone Python invoked through a user symlink can bake that
# symlink into pyvenv.cfg. Resolve its original base before copying the fixture.
fixture_python=$("$fixture_python" -I -B -c 'import os,sys; print(os.path.realpath(sys._base_executable or sys.executable))')
"$fixture_python" -I -B -m venv --copies --without-pip "$fixture_root/python environment's"
mkdir -p "$fixture_root/scripts/agent-validation-runtime" "$fixture_root/tests" "$fixture_root/bin" "$fixture_root/plugins/python-startup"
cp "$test_repo_root/scripts/run-plugin-tests.sh" "$fixture_root/scripts/run-plugin-tests.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/scripts/check-plugin-runtime-dependencies.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/scripts/run-plugin-minimum-runtime.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-run-plugin-tests-native-only.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-hermetic-cli-diagnostic.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-hermetic-python-startup.sh"
# Prerequisite dispatch is modeled; this fixture qualifies interpreter startup.
printf 'raise SystemExit(0)\n' >"$fixture_root/scripts/ci_gcp_test_prerequisites.py"
printf 'raise SystemExit(0)\n' >"$fixture_root/tests/test_native_capture_tools.py"
printf 'raise SystemExit(0)\n' >"$fixture_root/pytest.py"
printf '// Fixture execution is owned by the Bun stub.\n' >"$fixture_root/plugins/python-startup/startup.test.ts"
printf 'offline fixture graph\n' >"$fixture_root/plugins/python-startup/bun.lock"
cat >"$fixture_root/bin/bun" <<'BUN'
#!/usr/bin/env bash
set -euo pipefail
if [ "$PWD" = "$REPO_ROOT/plugins/python-startup" ] && [ "${1:-}" = test ]; then
  python3 -I -B -c 'import encodings,json,os,sys; expected=os.environ["HERMETIC_PYTHON_EXPECTED"]; assert sys.executable==expected,(sys.executable,expected); assert sys.prefix==os.path.dirname(os.path.dirname(expected)); assert sys.argv[1:]==["space value","semi;colon","literal$(not-executed)","quote"+chr(39)+"value"]; open(os.environ["HERMETIC_PYTHON_MARKER"],"w").write(json.dumps({"executable":sys.executable,"prefix":sys.prefix,"stdlib":encodings.__file__,"argv":sys.argv[1:]}))' 'space value' 'semi;colon' 'literal$(not-executed)' "quote'value"
fi
exit 0
BUN
chmod 700 "$fixture_root/bin/bun"
export REPO_ROOT="$fixture_root"
export HERMETIC_PYTHON_EXPECTED="$fixture_root/python environment's/bin/python3"
export HERMETIC_PYTHON_MARKER="$fixture_root/original-startup.private.json"
export CE_TEST_PYTHON_ARCHIVE="$fixture_root/synthetic-archive"
export PATH="$fixture_root/python environment's/bin:$fixture_root/bin:$PATH"
if ! bash "$fixture_root/scripts/run-plugin-tests.sh" >"$fixture_root/driver.private.log" 2>&1; then
  cat "$fixture_root/driver.private.log" >&2
  echo 'FAIL: hermetic PATH changed the original Python startup or arguments' >&2
  exit 1
fi
test -s "$HERMETIC_PYTHON_MARKER"
echo 'PASS: actual hermetic driver preserves Python venv startup and exact arguments'
