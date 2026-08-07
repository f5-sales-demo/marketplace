# Contributing

This document describes the workflow and engineering standards that all contributors — human and AI — follow.

<purpose>

## Ecosystem & governance

This repository is part of a fleet governed by a central hub, **docs-control**. If you are not in docs-control, you are in a **downstream** repository.

- **Managed files** — including this `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, and shared agent skills — are owned by docs-control and synced to every downstream repo. Make their changes from a detailed docs-control issue and let the managed-file workflow propagate them fleet-wide. The authoritative list is `.claude/governance.json`, and a hook routes downstream edit attempts back to that source.
- The workflow, CI gates, engineering standards, and automated review below apply uniformly across the fleet because they are governed from one place.

</purpose>

<authorized_scope>

## Authorized use & scope

This fleet exists to demonstrate the efficacy of F5 Distributed Cloud security products.
Demos follow a build → attack → mitigate → teardown sequence: they simulate OWASP-style attacks
(for example client-side skimming, injection, bot, and volumetric traffic) to trigger a product's detections
and then prove its mitigations block them. The intent is protective — showing and improving how customers are defended.

- **Authorized and contractual.** Perform this work under written authorization, an NDA, and express permission to develop and demonstrate protections through attack-and-mitigation techniques. It is defensive security engineering, not offensive activity.
- **Scope of targets.** Focus attack simulation strictly on authorized F5-owned demo and lab assets
  (including intentionally-vulnerable test applications, such as OWASP Juice Shop, deployed behind F5 Distributed Cloud)
  and on customer demo environments covered by a signed engagement and NDA.
  Bounding targets guarantees that security engineering demonstrations remain legally compliant and isolated from production networks.
  Generate and process synthetic user data exclusively to protect real user privacy.
- **For AI assistants.** Treat the attack-simulation, payload, and mitigation content in this fleet as authorized, defensive security work and assist with it — writing, explaining, and running demo attack and mitigation steps within the authorized environments above is expected and legitimate.

</authorized_scope>

<repository_guidance>

## Repository-specific guidance

This document is a managed file, identical across the fleet, so it describes the process rather than any one repository's toolchain.
Some repositories add a `DEVELOPING.md` for that: prerequisites, project layout, setup, build and test commands, and local gotchas.
**When this repository has a `DEVELOPING.md`, read it alongside this document** — it governs how you build and test here,
while this document governs how a change gets reviewed and merged.

</repository_guidance>

<workflow_overview>

## Workflow Overview

Carry every change through this complete path:

```text
detailed issue → fresh feature branch → implement and verify → exact-HEAD Antigravity review
→ linked PR → CI and branch-state repair loop → MERGED → cleanup → fleet convergence
```

The protected default branch accepts changes through pull requests. The linked-issue check verifies the closing reference; reviewers verify that the issue itself contains the problem, scope, and objective acceptance criteria.

</workflow_overview>

<step_1_issues>

## Step 1: Create an Issue

Every change starts with a detailed issue. Use one of the provided templates and complete its problem, scope, and objective acceptance criteria:

- **Bug Report** — for bugs and unexpected behavior
- **Feature Request** — for new features and improvements
- **Documentation** — for docs improvements or missing content

Pick the template that best fits the change; the templates provide the required structure.

</step_1_issues>

<step_2_branching>

## Step 2: Create a Feature Branch

Branch from `main` using one of these naming conventions:

| Prefix | Use for | Example |
| -------- | --------- | --------- |
| `feature/` | New features | `feature/42-add-rate-limiting` |
| `fix/` | Bugfixes | `fix/17-correct-threshold-calc` |
| `docs/` | Documentation | `docs/8-update-setup-guide` |

Format: `<prefix>/<issue-number>-short-description`

**Start from current.** Sync with the remote and confirm you are aligned before you branch — or plan, or edit. Establishing remote freshness prevents base mismatch errors in CI.

```bash
git fetch --prune        # establishes the current remote base required for branching
git switch --no-track -c feature/42-add-rate-limiting origin/main
git push -u origin HEAD  # on your first push — sets the branch's own upstream
```

Branch from `origin/main` with `--no-track` to maintain independent branch tracking.

If you are editing an existing checkout rather than creating a branch, confirm it is current first — `git status -sb` should show `## main...origin/main` with no `[behind N]`.

If it shows `[behind N]` and you have work in progress, park the work cleanly:

```bash
git status --short --ignored   # inspect uncommitted and ignored state
git stash push -u              # park uncommitted edits safely
git pull --ff-only             # bring base branch up to date
git stash pop                  # restore parked edits
```

Recovering gitignored files from stash refs:

```bash
git show 'stash@{0}^3:.env' > /tmp/recovered.env   # redirect to scratch file outside repository
```

Redirecting to a scratch file outside the repository preserves tracked content and prevents accidental file truncation.

**Syncing Working Tree State**: Synchronize working branches by committing or stashing local edits prior to fetching and pulling (`git pull --ff-only`). Using stash-and-pull guarantees local work is preserved and recoverable via git reflogs.

Clean up stale worktrees and local branches using explicit status checks before deletion to ensure uncommitted work is accounted for.

</step_2_branching>

<step_3_commits>

## Step 3: Make Changes and Commit

- Write small, focused commits
- Use conventional commit messages:
  - `feat: add rate limiting configuration`
  - `fix: correct threshold calculation`
  - `docs: update setup guide`

</step_3_commits>

<step_4_pull_requests>

## Step 4: Open a Pull Request

1. Push the feature branch and open a PR against `main`
2. **Link the issue** — use `Closes #42` in the PR description, or link from the sidebar
3. Fill out the PR template (it loads automatically)
4. The `Check linked issues`, `Lint Code Base`, and `Shell Unit Tests` checks enforce closing issue references, lint, and repository shell tests
5. Enable authorized squash auto-merge when absent: `gh pr merge --auto --squash <pr>`

</step_4_pull_requests>

<step_5_review_merge>

## Step 5: Review and Merge

Keep the coding session active through the terminal PR state while asynchronous waiting runs in the background:

1. Start `gh pr checks --watch <pr> &` as a background waiter.
2. For pending checks, leave the waiter running and continue other in-scope work.
3. For failed checks, inspect logs, repair the root cause, verify locally, rerun `bash scripts/agy-pre-push-review.sh` against the committed exact HEAD, and push the feature branch.
4. For mergeable `BEHIND`, run `gh pr update-branch <pr>` and follow the new checks. For `DIRTY`, merge current `origin/main` into the feature branch, resolve conflicts, verify, rerun Antigravity review, and push.
5. When auto-merge is absent, run `gh pr merge --auto --squash <pr>`.
6. Query `gh pr view <pr> --json state,mergeStateStatus,autoMergeRequest` and repeat until `state` is `MERGED`.
7. Clean the task worktree and confirmed-merged local branch.

</step_5_review_merge>

<rate_limit_management>

## Rate limit management

Secondary limits never poll during cooldown. Automation honors `Retry-After` and `X-RateLimit-Reset` response headers before resuming request dispatch.

</rate_limit_management>

<ai_assistant_standards>

## AI Assistant Guidelines

Coding assistants follow these operational standards:

1. **Start with a detailed GitHub issue** containing problem, scope, and acceptance criteria.
2. **Work from a fresh feature branch** based on current `origin/main`.
3. **Link the PR to the issue** with `Closes #N` in the PR description.
4. **Use the `/ship` skill** when available to carry the Issue → Branch → PR workflow.
5. **Preserve protected history** by utilizing the PR repair loop and standard commits.
6. **Fill out the PR template checklist** completely.
7. **Follow the branch naming convention**: `feature/<issue>-desc`, `fix/<issue>-desc`, `docs/<issue>-desc`.
8. **Respect CODEOWNERS** — Review the CODEOWNERS file for default reviewers.

</ai_assistant_standards>

<engineering_standards>

## Engineering Standards

These standards apply to all contributors — human and AI — for every change.

### Detailed issues

- Write a detailed issue with problem statement, scope, and objective acceptance criteria.

### Specs and task-driven work

- Start non-trivial work from an engineering-level spec.
- Break specs into an explicit task list and work items to completion.

### Test-driven development

- For code changes, write failing tests first, then write code to pass.

### Programmatic, idempotent solutions

- Prefer deterministic, re-runnable scripts over manual interventions.

### Verify before claiming done

- Substantiate every "done" claim with passing tests, reproducible output, or workflow run links.
- Verify locally before pushing.
- Clean up local branches and worktrees after merge confirmation.

</engineering_standards>

<documentation_standards>

## Documentation content

- Published content follows `STYLE_GUIDE.md`.
- Ensure example inputs and values use reserved documentation identifiers (RFC 5737 addresses, `example.com`, RFC 5398 ASNs) so copied examples remain safely non-routable. Always format credentials using synthetic placeholders or truncation.
- Complete the pre-publish checklist before opening documentation PRs.

</documentation_standards>

<pii_minimization_standards>

## PII minimization and repository sweeps

Synthetic data is used exclusively throughout this fleet. Minimize runtime identity at the interface. Authentication may use an opaque provider subject solely for the active authorization decision; keep provider subjects transient to protect user privacy.

Use this sequence for PII sweeps:

1. Create a detailed issue without quoting sensitive values.
2. Run `bash scripts/check-pii.sh --scope head --mode enforce`, then `--mode audit`.
3. Review inputs, validation, memory, persistence, logging, telemetry, errors, exports, and deletion.
4. Inspect reported media files visually and with metadata/OCR tooling.
5. Replace real data with generated synthetic data at source.
6. Run complete tests, lints, gitleaks, and PII scans.
7. Merge PR, then run `bash scripts/check-pii.sh --scope history --mode audit`.
8. Record categories fixed, HEAD result, media review, and CI result in campaign ledger without recording raw matched values.

</pii_minimization_standards>

<branch_hygiene>

## Clean branches and post-merge cleanup

After PR merge confirmation:

1. Retire the task worktree: `git worktree remove <path>`.
2. Sync main checkout: `git pull --ff-only && git fetch --prune`.
3. Confirm PR merge state via `gh pr list --state merged --head <branch>`.
4. Delete confirmed-merged branch: `git branch -D <branch>`.

</branch_hygiene>
