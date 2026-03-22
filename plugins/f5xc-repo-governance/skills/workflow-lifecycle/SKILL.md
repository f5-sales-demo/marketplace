---
name: workflow-lifecycle
description: >-
  Repository governance workflow for f5xc-salesdemos — issue creation, branch
  naming, PR workflow, CI polling, post-merge monitoring, verification, and
  task completion criteria. Use when starting a new task, creating a PR,
  merging a PR, monitoring CI, verifying outcomes, or checking rate limits.
  Also activates when encountering HTTP 403/429 from the GitHub API.
user-invocable: false
---

# Repository Workflow Lifecycle

This skill defines the full task lifecycle for all
`f5xc-salesdemos` repositories. **DO NOT STOP after
creating a PR** — the task is not complete until the PR
is merged, all post-merge workflows succeed, and local
branches are cleaned.

## Project-Specific Requirements

These constraints apply on top of any plugin defaults:

1. **Create a GitHub issue** before making any changes
2. **Sync local main** before branching:
   `git checkout main && git pull origin main`
3. **Create a feature branch** from `main` — never
   commit to `main` directly
4. **Link PRs to issues** using `Closes #N` in the
   PR body — fill out the PR template completely
5. **Conventional commits** — use `feat:`, `fix:`,
   `docs:` prefixes
6. **Fix any CI failures** — monitor checks with
   `gh pr checks <NUMBER>`, fix locally, push to
   trigger re-runs

## Branch Naming

Use the format `<prefix>/<issue-number>-short-description`:

- `feature/42-add-rate-limiting`
- `fix/17-correct-threshold`
- `docs/8-update-guide`

## Merging

Merge after CI passes. Do not wait for manual approval
(none is required).

Poll PR checks using single-shot queries (never
`--watch`) per `references/polling-protocol.md`:

```
gh pr checks <NUMBER> --json bucket \
  --jq 'map(.bucket) | unique | if . == ["pass"] then "pass"
  elif any(. == "fail") then "fail" else "pending" end'
```

Once all checks pass:

```
gh pr merge <NUMBER> --squash --delete-branch
```

If the merge fails, check why:

```
gh pr view <NUMBER> --json mergeable,mergeStateStatus
```

## Post-Merge Monitoring

Merging to `main` triggers additional workflows (docs
builds, governance sync, etc.). Discover and poll them
using single-shot checks (never `--watch`):

```
git checkout main && git pull origin main
MERGE_SHA=$(git rev-parse HEAD)
sleep 15
gh run list --branch main --commit $MERGE_SHA
```

Then poll each run per `references/polling-protocol.md`:

```
gh run view <RUN-ID> --json status,conclusion \
  --jq '"\(.status) \(.conclusion)"'
```

Sleep for the interval matching the current consumption
zone (30s GREEN, 60s YELLOW). Maximum 20 iterations —
then report to user.

**Failure handling:**

- Focus only on workflows triggered by your merge
  commit (`$MERGE_SHA`) — ignore historical failures
- View logs: `gh run view <RUN-ID> --log-failed`
- Fix the root cause — create a new issue, branch,
  and PR with the fix
- Report to user what failed and what you did to fix it
- Do not investigate or report on workflow failures
  from other commits

## Verification

Apply `superpowers:verification-before-completion`
before any completion claims. Then run these
project-specific checks:

Always check:

```
# Issue was closed by the PR
gh issue view <NUMBER> --json state --jq '.state'

# Branch protection matches expected state
gh api repos/{owner}/{repo}/branches/main/protection \
  --jq '.required_status_checks.contexts'
```

If `docs/**` changed:

```
# Docs site is accessible
REPO=$(basename $(pwd))
curl -sf "https://f5xc-salesdemos.github.io/${REPO}/" \
  && echo "OK" || echo "FAIL"
```

If governance or config files changed, check rate
limits first (read `references/rate-limit-management.md`)
and adapt scope:

- **GREEN** (>1,000 remaining): check all repos
- **YELLOW** (200–1,000): spot-check 3 repos
  (first, middle, last from the list)
- **RED** (<200): skip entirely, report deferral
  to user

```
# Downstream repos were dispatched successfully
for repo in $(jq -r '.[]' .github/config/downstream-repos.json); do
  echo "$repo:"
  gh run list --repo "$repo" \
    --workflow enforce-repo-settings.yml --limit 1
done
```

**Repository health** — after your task is fully done:

```
# Open issues
gh issue list --state open

# Unmerged PRs
gh pr list --state open
```

If any open issues or stale PRs are found, report
them to the user.

## Task Completion

Read `references/task-completion-checklist.md` for the
full checklist. A task is NOT complete until all items
are verified.

## Cleanup

Use `/clean_gone` to remove stale branches and
worktrees proactively. Do not ignore workspace issues
because they predate your task.

## Rate Limit Management

Read `references/rate-limit-management.md` for the
full rate limit protocol including consumption zones,
banned commands, budget estimates, and 403 recovery.

## Rules

- Never push directly to `main`
- Never force push
- Every PR must link to an issue
- Fill out the PR template completely
- Follow conventional commit messages (`feat:`, `fix:`, `docs:`)
- Never consider a task complete until post-merge workflows pass
