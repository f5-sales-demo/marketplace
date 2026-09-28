#!/bin/sh
set -eu

ACTION=${1:-}
PLUGIN_VERSION=${2:-}
MINIMUM_PROTOCOL=27
PINNED_VERSION=0.19.2
PINNED_PROTOCOL=27
INSTALL_DIR=${HERDR_INSTALL_DIR:-$HOME/.local/bin}
STATE_HOME=${XDG_STATE_HOME:-$HOME/.local/state}
RECEIPT_PATH=${XCSH_HERDR_RECEIPT_PATH:-$STATE_HOME/xcsh/herdr/setup-receipt.json}
RECEIPT_DIR=$(dirname "$RECEIPT_PATH")
LOCK_DIR=$RECEIPT_DIR/install.lock
STAGED_BINARY=
STAGED_RECEIPT=
LOCK_OWNED=0

fail() {
  printf 'herdr_setup_error:%s\n' "$1" >&2
  exit 1
}

cleanup() {
  [ -z "$STAGED_BINARY" ] || rm -f "$STAGED_BINARY"
  [ -z "$STAGED_RECEIPT" ] || rm -f "$STAGED_RECEIPT"
  if [ "$LOCK_OWNED" -eq 1 ]; then rm -rf "$LOCK_DIR"; fi
}
trap cleanup EXIT HUP INT TERM

case "$ACTION" in apply | verify) ;; *) fail invalid_action ;; esac
case "$PLUGIN_VERSION" in
'' | *[!0-9.]* | .* | *.) fail invalid_plugin_version ;;
esac

HOST_OS=$(uname -s)
OS=${HERDR_TEST_OS:-$HOST_OS}
ARCH=${HERDR_TEST_ARCH:-$(uname -m)}
case "$OS" in
Linux) PLATFORM=linux ;;
Darwin) PLATFORM=macos ;;
*) fail "unsupported_platform:$OS" ;;
esac
case "$ARCH" in
x86_64 | amd64) CPU=x86_64 ;;
aarch64 | arm64) CPU=aarch64 ;;
*) fail "unsupported_target:$PLATFORM-$ARCH" ;;
esac
TARGET=$PLATFORM-$CPU
ASSET_NAME=herdr-$TARGET
BINARY_PATH=$INSTALL_DIR/herdr

is_forced_missing() {
  case ",${HERDR_TEST_MISSING_COMMANDS:-}," in *,$1,*) return 0 ;; *) return 1 ;; esac
}

missing_linux_prerequisites() {
  missing=
  for command_name in curl python3 sha256sum; do
    if is_forced_missing "$command_name" || ! command -v "$command_name" >/dev/null 2>&1; then
      missing="$missing $command_name"
    fi
  done
  printf '%s' "${missing# }"
}

bootstrap_linux_prerequisites() {
  missing=$(missing_linux_prerequisites)
  [ -n "$missing" ] || return 0
  if [ "${HERDR_TESTING:-}" = 1 ]; then
    [ -n "${HERDR_TEST_APT_LOG:-}" ] || fail "missing_prerequisite:$missing"
    printf '%s\n' 'apt-get install --yes ca-certificates curl python3 coreutils' >"$HERDR_TEST_APT_LOG"
    return 0
  fi
  [ -r /etc/os-release ] || fail "missing_prerequisite:$missing"
  # shellcheck disable=SC1091
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] || fail "missing_prerequisite:$missing"
  if [ "$(id -u)" -eq 0 ]; then SUDO=; elif command -v sudo >/dev/null 2>&1; then SUDO=sudo; else fail missing_prerequisite:sudo; fi
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get update -y
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y ca-certificates curl python3 coreutils
}

if [ "$PLATFORM" = linux ]; then
  bootstrap_linux_prerequisites
else
  [ -x /usr/bin/curl ] || fail missing_prerequisite:curl
  [ -x /usr/bin/shasum ] || fail missing_prerequisite:shasum
  [ -x /usr/bin/osascript ] || fail missing_prerequisite:osascript
fi

file_sha256() {
  if [ "$HOST_OS" = Linux ]; then
    sha256sum "$1" | awk '{print tolower($1)}'
  else
    /usr/bin/shasum -a 256 "$1" | awk '{print tolower($1)}'
  fi
}

receipt_value() {
  if [ "$HOST_OS" = Linux ]; then
    python3 - "$RECEIPT_PATH" "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as stream:
    value = json.load(stream).get(sys.argv[2])
if isinstance(value, bool) or value is None or isinstance(value, (dict, list)):
    raise SystemExit(1)
print(value)
PY
  else
    /usr/bin/osascript -l JavaScript - "$RECEIPT_PATH" "$1" <<'JXA'
ObjC.import('Foundation');
function readUtf8(path) {
  const data = $.NSData.dataWithContentsOfFile(path);
  if (!data) throw new Error('receipt_read');
  return ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
}
function run(argv) {
  const value = JSON.parse(readUtf8(argv[0]))[argv[1]];
  if (value === null || typeof value === 'object' || typeof value === 'boolean') throw new Error('receipt_value');
  return String(value);
}
JXA
  fi
}

receipt_mode() {
  if [ "$HOST_OS" = Linux ]; then stat -c '%a' "$RECEIPT_PATH"; else stat -f '%Lp' "$RECEIPT_PATH"; fi
}

verify_installation() {
  [ -f "$BINARY_PATH" ] && [ ! -L "$BINARY_PATH" ] && [ -f "$RECEIPT_PATH" ] || return 1
  [ "$(receipt_mode 2>/dev/null)" = 600 ] || return 1
  [ "$(receipt_value schema_version 2>/dev/null)" = 1 ] || return 1
  [ "$(receipt_value plugin_version 2>/dev/null)" = "$PLUGIN_VERSION" ] || return 1
  [ "$(receipt_value target 2>/dev/null)" = "$TARGET" ] || return 1
  [ "$(receipt_value installed_path 2>/dev/null)" = "$BINARY_PATH" ] || return 1
  receipt_version=$(receipt_value herdr_version 2>/dev/null) || return 1
  receipt_protocol=$(receipt_value protocol 2>/dev/null) || return 1
  receipt_sha=$(receipt_value sha256 2>/dev/null) || return 1
  receipt_url=$(receipt_value url 2>/dev/null) || return 1
  case "$receipt_version" in '' | *[!0-9.]* | .* | *.) return 1 ;; esac
  case "$receipt_protocol" in '' | *[!0-9]* | 0) return 1 ;; esac
  [ "$receipt_protocol" -ge "$MINIMUM_PROTOCOL" ] || return 1
  case "$receipt_sha" in
  *[!0-9a-f]* | '') return 1 ;;
  esac
  [ "${#receipt_sha}" -eq 64 ] || return 1
  [ "$receipt_url" = "https://github.com/f5-sales-demo/herdr/releases/download/v$receipt_version/$ASSET_NAME" ] || return 1
  [ "$(file_sha256 "$BINARY_PATH")" = "$receipt_sha" ] || return 1
  version_output=$($BINARY_PATH --version 2>/dev/null) || return 1
  case " $version_output " in *" $receipt_version "*) return 0 ;; *) return 1 ;; esac
}

if [ "$ACTION" = verify ]; then
  verify_installation || fail setup_incomplete
  printf 'Herdr installation verified: %s\n' "$BINARY_PATH"
  exit 0
fi

mkdir -p "$INSTALL_DIR" "$RECEIPT_DIR"
chmod 700 "$RECEIPT_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_pid=$(sed -n '1p' "$LOCK_DIR/pid" 2>/dev/null || true)
  case "$lock_pid" in
  '' | *[!0-9]*) rm -rf "$LOCK_DIR" ;;
  *) if kill -0 "$lock_pid" 2>/dev/null; then fail install_busy; else rm -rf "$LOCK_DIR"; fi ;;
  esac
  mkdir "$LOCK_DIR" 2>/dev/null || fail install_busy
fi
LOCK_OWNED=1
printf '%s\n' "$$" >"$LOCK_DIR/pid"
find "$INSTALL_DIR" -maxdepth 1 -type f -name '.herdr.xcsh.tmp.*' -exec rm -f {} \;

VERSION=$PINNED_VERSION
PROTOCOL=$PINNED_PROTOCOL
case "$TARGET" in
linux-x86_64) EXPECTED_SHA=8de126f93b97a11a4ce7be84614acbc1f9bea7b6453300cd5e7b75b2e820b394 ;;
linux-aarch64) EXPECTED_SHA=dbf25d255a3dcfb5eb3f5bd5ac6f03a541736e56ecf451d789b2a9e3b877d00c ;;
macos-x86_64) EXPECTED_SHA=36c933a42bc0506ff1ac4e74c90a4dcd2bdb06bf6845cda580ec3525601b890a ;;
macos-aarch64) EXPECTED_SHA=f82bf856cf50904f007da1abe2139668ba70f0b81339f4ec198af30da6cd313a ;;
*) fail "unsupported_target:$TARGET" ;;
esac
if [ "${HERDR_TESTING:-}" = 1 ] && [ -n "${HERDR_TEST_EXPECTED_SHA:-}" ]; then
  EXPECTED_SHA=$HERDR_TEST_EXPECTED_SHA
fi
IMMUTABLE_URL=https://github.com/f5-sales-demo/herdr/releases/download/v$PINNED_VERSION/$ASSET_NAME

if verify_installation &&
  [ "$(receipt_value herdr_version)" = "$VERSION" ] &&
  [ "$(receipt_value protocol)" = "$PROTOCOL" ] &&
  [ "$(receipt_value sha256)" = "$EXPECTED_SHA" ] &&
  [ "$(receipt_value url)" = "$IMMUTABLE_URL" ]; then
  printf 'Herdr %s already installed; no changes required.\n' "$VERSION"
  exit 0
fi

STAGED_BINARY=$INSTALL_DIR/.herdr.xcsh.tmp.$$
if [ -n "${HERDR_PACKAGE_FILE:-}" ]; then
  cp "$HERDR_PACKAGE_FILE" "$STAGED_BINARY"
else
  if [ "$HOST_OS" = Darwin ]; then CURL=/usr/bin/curl; else CURL=curl; fi
  "$CURL" -fsSL --retry 3 --connect-timeout 10 --max-time 180 --proto '=https' "$IMMUTABLE_URL" -o "$STAGED_BINARY" || fail asset_download
fi
chmod 755 "$STAGED_BINARY"
ACTUAL_SHA=$(file_sha256 "$STAGED_BINARY")
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || fail checksum_mismatch
staged_version=$($STAGED_BINARY --version 2>/dev/null) || fail binary_verification
case " $staged_version " in *" $VERSION "*) ;; *) fail binary_version ;; esac
[ "${HERDR_TEST_INTERRUPT_AFTER_STAGE:-}" != 1 ] || fail interrupted_after_stage
mv -f "$STAGED_BINARY" "$BINARY_PATH"
STAGED_BINARY=

INSTALLED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
STAGED_RECEIPT=$RECEIPT_DIR/.setup-receipt.json.$$
if [ "$HOST_OS" = Linux ]; then
  python3 - "$STAGED_RECEIPT" "$PLUGIN_VERSION" "$VERSION" "$PROTOCOL" "$TARGET" "$IMMUTABLE_URL" "$EXPECTED_SHA" "$BINARY_PATH" "$INSTALLED_AT" <<'PY'
import json, os, sys
path = sys.argv[1]
receipt = {
    "schema_version": 1,
    "plugin_version": sys.argv[2],
    "herdr_version": sys.argv[3],
    "protocol": int(sys.argv[4]),
    "target": sys.argv[5],
    "url": sys.argv[6],
    "sha256": sys.argv[7],
    "installed_path": sys.argv[8],
    "installed_at": sys.argv[9],
}
descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
    json.dump(receipt, stream, sort_keys=True, separators=(",", ":"))
    stream.write("\n")
PY
else
  /usr/bin/osascript -l JavaScript - "$PLUGIN_VERSION" "$VERSION" "$PROTOCOL" "$TARGET" "$IMMUTABLE_URL" "$EXPECTED_SHA" "$BINARY_PATH" "$INSTALLED_AT" >"$STAGED_RECEIPT" <<'JXA'
function run(argv) {
  return JSON.stringify({
    schema_version: 1,
    plugin_version: argv[0],
    herdr_version: argv[1],
    protocol: Number(argv[2]),
    target: argv[3],
    url: argv[4],
    sha256: argv[5],
    installed_path: argv[6],
    installed_at: argv[7],
  }) + '\n';
}
JXA
  chmod 600 "$STAGED_RECEIPT"
fi
mv -f "$STAGED_RECEIPT" "$RECEIPT_PATH"
STAGED_RECEIPT=
verify_installation || fail post_install_verification
printf 'Installed Herdr %s to %s.\n' "$VERSION" "$BINARY_PATH"
