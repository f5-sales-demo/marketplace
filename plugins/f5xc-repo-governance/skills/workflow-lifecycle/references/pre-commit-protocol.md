# Pre-commit Protocol

The `github-ops` agent runs pre-commit as a mandatory gate
before every commit. This document describes the install
procedure, hook inventory, and execution mode.

## Idempotent Installation

The agent runs these checks in order on every invocation:

1. **CLI available**: `command -v pre-commit`
   - If missing → `BLOCKED` (environment issue)

2. **Config exists**: `test -f .pre-commit-config.yaml`
   - If missing → `BLOCKED` (repo not onboarded)

3. **Hooks installed**: `test -f .git/hooks/pre-commit`
   - If missing → `pre-commit install`
   - If present → no-op (idempotent)

No network calls or Docker pulls occur during install.
The config is already present in every repo (synced from
`docs-control` via managed files).

## Fast-Mode Execution

The agent runs hooks with the Docker super-linter skipped:

```
SKIP=super-linter pre-commit run --files <staged-files>
```

This executes only fast, local hooks — completing in seconds
rather than the 30–60s required for the Docker super-linter.

Super-linter still runs server-side in GitHub Actions CI.
The fast local gate catches the most common issues before
they reach CI.

## Hook Inventory

Hooks executed in fast mode (in order):

| Hook                     | Source             | What it checks                                                        |
| ------------------------ | ------------------ | --------------------------------------------------------------------- |
| `no-commit-to-branch`    | `pre-commit-hooks` | Blocks direct commits to `main`                                       |
| `local-hooks`            | Local repo         | Runs `scripts/pre-commit-local.sh` if present (repo-specific linting) |
| `check-added-large-files`| `pre-commit-hooks` | Blocks files >1024 KB                                                 |

Hooks skipped in fast mode:

| Hook           | Source         | Why skipped                                   |
| -------------- | -------------- | --------------------------------------------- |
| `super-linter` | Local (Docker) | Requires Docker, ~30-60s, runs in CI instead  |

## Common Failure Patterns

### `no-commit-to-branch` fails

**Cause**: Attempting to commit while on `main` branch.

**Fix**: The `github-ops` agent creates a feature branch
before staging (Step 2). If this hook fails, the agent
was invoked incorrectly — check that the branch was
created before staging files.

### `local-hooks` fails

**Cause**: Repository-specific linting failed. Each repo
can define custom checks in `scripts/pre-commit-local.sh`
(e.g., `ruff check`, `eslint`, `tsc --noEmit`).

**Fix**: Read the error output — it contains the specific
linter failures. Fix the code in the main session and
re-delegate to `github-ops`.

### `check-added-large-files` fails

**Cause**: A staged file exceeds 1024 KB.

**Fix**: Remove the large file from staging, use Git LFS,
or reduce the file size. Common culprits: images, PDFs,
compiled binaries.

## Relationship to CI

The fast pre-commit gate is a **subset** of what CI checks.
CI runs the full super-linter with all validators. The local
gate catches governance violations, repo-specific lint
errors, and oversized files — the most common failure modes
that waste CI cycles.

If pre-commit passes locally but CI fails, the failure is
likely from a validator that only runs in super-linter
(YAML, Markdown, Shell, etc.). The `github-ops` agent will
capture the CI failure logs and post them as an issue comment.
