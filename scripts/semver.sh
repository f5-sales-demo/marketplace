#!/usr/bin/env bash
# SemVer 2.0.0 validation, including coordinated UAT prereleases.
is_valid_semver() {
  local numeric='(0|[1-9][0-9]*)'
  local prerelease='(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
  local build='[0-9A-Za-z-]+'
  local pattern="^${numeric}\.${numeric}\.${numeric}(-${prerelease}(\.${prerelease})*)?(\+${build}(\.${build})*)?$"
  [[ "$1" =~ $pattern ]]
}
