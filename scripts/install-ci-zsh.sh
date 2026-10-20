#!/usr/bin/env bash
# Extract a verified Ubuntu shell into this job; never modify the runner image.
set -euo pipefail

for path_name in RUNNER_TEMP GITHUB_PATH; do
  path_value="${!path_name:-}"
  if [[ "$path_value" != /* || "$path_value" == *$'\n'* ]]; then
    echo "$path_name must be an absolute path without newlines" >&2
    exit 1
  fi
done
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "CI Zsh qualification requires the Ubuntu amd64 runner" >&2
  exit 1
fi

# Ubuntu noble main Packages publishes these immutable package digests.
# Noninteractive command qualification needs the shell binary;
# completion/documentation packages are not required.
zsh_version=5.9
package_name=zsh_5.9-6ubuntu2_amd64.deb
expected_sha256=bd5cc8dd3a01a6db38c0a815d75202c356a9c7f378674ba7bed9bc86dcba8af0
install_root=$(mktemp -d "${RUNNER_TEMP%/}/zsh-${zsh_version}.XXXXXX")
archive_path="${install_root}/${package_name}"
curl --fail --location --proto '=https' --show-error --silent --tlsv1.2 \
  --output "$archive_path" "https://archive.ubuntu.com/ubuntu/pool/main/z/zsh/${package_name}"
printf '%s  %s\n' "$expected_sha256" "$archive_path" | sha256sum --check --status
dpkg-deb --extract "$archive_path" "$install_root"
actual_version=$("${install_root}/bin/zsh" --version)
if [[ "$actual_version" != "zsh ${zsh_version} "* ]]; then
  echo "Expected Zsh ${zsh_version}, got ${actual_version}" >&2
  exit 1
fi
printf '%s\n' "${install_root}/bin" >>"$GITHUB_PATH"
printf 'Installed %s in the runner temporary directory\n' "$actual_version"
