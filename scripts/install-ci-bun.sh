#!/usr/bin/env bash
# Install the pinned CI Bun release without mutating a persistent runner user's home.
set -euo pipefail

bun_version=1.3.14

if [[ -z "${RUNNER_TEMP:-}" || "$RUNNER_TEMP" != /* || "$RUNNER_TEMP" == *$'\n'* ]]; then
  echo "RUNNER_TEMP must be an absolute path without newlines" >&2
  exit 1
fi
if [[ -z "${GITHUB_PATH:-}" || "$GITHUB_PATH" != /* || "$GITHUB_PATH" == *$'\n'* ]]; then
  echo "GITHUB_PATH must be an absolute path without newlines" >&2
  exit 1
fi

for command_name in curl sha256sum uname unzip; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
done

case "$(uname -m)" in
x86_64)
  bun_asset=bun-linux-x64.zip
  expected_sha256=951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f
  ;;
aarch64 | arm64)
  bun_asset=bun-linux-aarch64.zip
  expected_sha256=a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b
  ;;
*)
  echo "Unsupported Linux architecture: $(uname -m)" >&2
  exit 1
  ;;
esac

install_root=$(mktemp -d "${RUNNER_TEMP%/}/bun-${bun_version}.XXXXXX")
archive_path="${install_root}/${bun_asset}"
download_url="https://github.com/oven-sh/bun/releases/download/bun-v${bun_version}/${bun_asset}"

curl --fail --location --proto '=https' --show-error --silent --tlsv1.2 \
  --output "$archive_path" "$download_url"
printf '%s  %s\n' "$expected_sha256" "$archive_path" | sha256sum --check --status
unzip -q "$archive_path" -d "$install_root"

bun_bin_dir="${install_root}/${bun_asset%.zip}"
actual_version=$("${bun_bin_dir}/bun" --version)
if [[ "$actual_version" != "$bun_version" ]]; then
  echo "Expected Bun ${bun_version}, got ${actual_version}" >&2
  exit 1
fi

printf '%s\n' "$bun_bin_dir" >>"$GITHUB_PATH"
printf 'Installed Bun %s in the runner temporary directory\n' "$actual_version"
