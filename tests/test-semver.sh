#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/scripts/semver.sh"
for version in 7.0.0 7.0.0-uat.1 5.0.0-uat.12 1.2.3-alpha-beta.0+build.01; do
  is_valid_semver "$version" || {
    echo "Valid SemVer rejected: $version"
    exit 1
  }
done
for version in 07.0.0 7.00.0 7.0.0-uat.01 7.0.0- 7.0.0-uat..1 7.0.0+ 7.0.0/uat 7.0.0-uat_1; do
  if is_valid_semver "$version"; then
    echo "Invalid SemVer accepted: $version"
    exit 1
  fi
done
echo 'SemVer stable and UAT candidate validation passed'
