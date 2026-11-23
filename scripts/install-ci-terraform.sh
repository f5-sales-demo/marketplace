#!/usr/bin/env bash
# Install the current CE qualification runtime inside this job's temporary scope.
set -euo pipefail
umask 077
terraform_version=1.17.2
for env_name in RUNNER_TEMP GITHUB_PATH; do
  env_value=${!env_name:-}
  if [[ -z "$env_value" || "$env_value" != /* || "$env_value" == *$'\n'* ]]; then
    printf '%s must be an absolute path without newlines\n' "$env_name" >&2
    exit 1
  fi
done
for command_name in curl sha256sum uname unzip python3; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done
if [[ "$(uname -s)" != Linux ]]; then
  echo 'CI Terraform qualification requires Linux' >&2
  exit 1
fi
case "$(uname -m)" in
x86_64)
  terraform_arch=amd64
  expected_archive_sha256=e6f16b2f0b137ee5729caa8c4e79a3bae4ee261acd198a1fcfa8584a6296605b
  ;;
aarch64 | arm64)
  terraform_arch=arm64
  expected_archive_sha256=858e08c181a76b6b223e8c767a8e983922eebe2d062db949a2de66ce040c368c
  ;;
*)
  printf 'Unsupported Linux architecture: %s\n' "$(uname -m)" >&2
  exit 1
  ;;
esac
install_root=$(mktemp -d "${RUNNER_TEMP%/}/terraform-${terraform_version}.XXXXXX")
archive_name="terraform_${terraform_version}_linux_${terraform_arch}.zip"
archive_path="${install_root}/${archive_name}"
curl --fail --location --proto '=https' --proto-redir '=https' --show-error --silent --tlsv1.2 \
  --output "$archive_path" "https://releases.hashicorp.com/terraform/${terraform_version}/${archive_name}"
printf '%s  %s\n' "$expected_archive_sha256" "$archive_path" | sha256sum --check --status
unzip -q "$archive_path" -d "$install_root"
"${install_root}/terraform" version -json >"${install_root}/version.json"
actual_version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["terraform_version"])' "${install_root}/version.json")
if [[ "$actual_version" != "$terraform_version" ]]; then
  printf 'Expected Terraform %s, got %s\n' "$terraform_version" "$actual_version" >&2
  exit 1
fi
printf '%s\n' "$install_root" >>"$GITHUB_PATH"
printf 'Installed Terraform %s in the runner temporary directory\n' "$actual_version"
