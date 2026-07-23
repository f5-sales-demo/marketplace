#!/usr/bin/env bash
# pre-commit-local.sh — repository-specific pre-commit hooks.
#
# Dispatched by the `local-hooks` entry in .pre-commit-config.yaml, which runs this
# file only when it exists and is executable (`if [ -x scripts/pre-commit-local.sh ]`).
# Add repo-local hook invocations here.
#
# NOTE: the pre-commit framework must be installed for this to run on commit —
# `pre-commit install` (see CONTRIBUTING.md). The authoritative enforcement is the
# CI gate (scripts/check-version-bumps.sh, run by .github/workflows/validate-plugins.yml);
# this hook is the local convenience that patch-bumps automatically so you rarely hit it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Auto patch-bump any plugin whose content files are staged (unless already bumped).
"$REPO_ROOT/scripts/auto-bump-version.sh"
