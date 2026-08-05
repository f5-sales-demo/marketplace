# Git Standard Operating Procedures (Git SOPs) & DevOps Mastery Guide

This document defines the authoritative GitHub Operations Standard Operating Procedures (SOPs) for `f5-sales-demo` repositories — with special focus on **Content Creator Repositories** (`content` class in `.claude/governance.json` and `xcsh://fleet`).

---

## 1. Core Philosophy: DevOps Engineer GitHub Mastery

When the `github-ops` plugin is active, `xcsh` operates with the professional precision of a senior DevOps and release engineer:
- **Zero Unlinked Changes**: Every commit and PR traces back to a verified GitHub issue.
- **Zero Branch Bloat**: Merged feature branches and worktrees are cleaned up immediately.
- **Rate-Limit Awareness**: All API interactions use cached, backoff-aware, ETag-checked requests.
- **Verification First**: Never claim completion without empirical confirmation that CI passed and the issue is closed.

---

## 2. Content Creator Repository Guidance

A repository designated as a **content creator repository** (`content` class in `.claude/governance.json` or `xcsh://fleet`) holds documentation, Terraform plans, lab walkthroughs, and demo scripts. In content repositories:
1. `xcsh` authors content directly.
2. All contributions MUST follow the governed path: **Issue → Feature Branch / Worktree → PR with `Closes #N` → CI Green → Squash Merge → Teardown & Hygiene**.

---

## 3. The 5-Phase Git SOPs Lifecycle

### Phase 1: Comprehensive GitHub Issue Creation
Before making any changes or developing content:
- Inspect existing open issues (`gh issue list`) to avoid duplicates.
- Create a comprehensive GitHub issue containing:
  - Title: `<type>: <concise description>` (`feat`, `fix`, `docs`, `chore`)
  - Summary and business/technical motivation
  - Affected content surfaces (e.g. `docs/`, `terraform/`, `scripts/`)
  - Concrete acceptance and verification criteria

```bash
gh issue create \
  --title "docs: add onboarding lab guide for F5 XC WAAP" \
  --body "## Motivation... ## Content Scope... ## Acceptance Criteria..."
```

### Phase 2: Feature Branch & Git Worktree Setup
- Fetch latest refs and prune stale tracking branches: `git fetch --prune origin`
- Sync `main` fast-forward: `git checkout main && git pull --ff-only origin main`
- Create a dedicated feature branch following naming conventions:
  - `feature/<issue-number>-<short-description>` for `feat:`
  - `fix/<issue-number>-<short-description>` for `fix:`
  - `docs/<issue-number>-<short-description>` for `docs:`
  - `chore/<issue-number>-<short-description>` for `chore:`
- *Optional (Isolated Worktree)*: For parallel work, create an isolated worktree:
  ```bash
  git worktree add -b feature/<issue-number>-<desc> ../wt-<issue-number> origin/main
  ```

### Phase 3: Staging, Pre-Commit, & PR Creation
- Stage specific modified files only: `git add docs/lab1.md` (never `git add -A` or `git add .`).
- Execute fast local pre-commit lint gate:
  ```bash
  SKIP=super-linter pre-commit run --files <staged-files>
  ```
- Commit using Conventional Commits format with explicit issue linking:
  ```bash
  git commit -m "docs: add onboarding lab guide for F5 XC WAAP

  Closes #<issue-number>"
  ```
- Push feature branch to origin: `git push -u origin <branch-name>`
- Create Pull Request linking the issue:
  ```bash
  gh pr create --title "docs: add onboarding lab guide for F5 XC WAAP" \
    --body "## Summary... Closes #<issue-number> ## Test plan..."
  ```

### Phase 4: Rate-Limit Aware CI Polling & Merge
- Use `gh-poll` rate-limit-aware caching library (`poll_until`) to monitor PR checks.
- If CI fails:
  - Extract failed logs (`gh run view <run-id> --log-failed`).
  - If infrastructure failure (OOM, loss of runner), rerun failed jobs once (`gh run rerun <run-id> --failed`).
  - If code/content failure, post diagnostic comment on issue and fix.
- Once CI passes and branch is up to date:
  ```bash
  gh pr merge <pr-number> --squash --delete-branch
  ```

### Phase 5: Post-Merge Hygiene & Teardown
Clean up after yourself immediately upon completion:
1. Switch back to `main` and pull latest changes:
   ```bash
   git checkout main && git pull origin main
   ```
2. Delete local feature branch:
   ```bash
   git branch -d <branch-name>
   ```
3. If remote branch remains, delete it:
   ```bash
   git push origin --delete <branch-name> 2>/dev/null || true
   ```
4. If a git worktree was created, remove it:
   ```bash
   git worktree remove <worktree-path> --force
   ```
5. Prune stale remote tracking branches:
   ```bash
   git fetch --prune
   ```
6. Confirm issue is closed:
   ```bash
   gh issue view <issue-number> --json state --jq '.state'
   ```

---

## 4. Progressive Context Hinting Matrix

During session execution, context hints are progressively provided to guide the assistant through the SOP stages:

| Lifecycle Phase | Hint / Prompt Context | Key Action |
| --------------- | --------------------- | ---------- |
| **0. Pre-Flight** | Content Creator Repository detected (`content` class). Governance requires issue-driven development. | Read `xcsh://fleet`, verify auth. |
| **1. Issue Setup** | Create comprehensive GitHub issue before editing content. | `gh issue create` |
| **2. Branching** | Create feature branch (`feature/<issue>-desc`) or worktree from `origin/main`. | `git checkout -b` or `git worktree add` |
| **3. PR & Link** | Pre-commit lint gate passed. Open PR with `Closes #N`. | `git commit` & `gh pr create` |
| **4. CI & Merge** | Poll CI checks until green. Perform squash merge. | `poll_until` & `gh pr merge --squash` |
| **5. Hygiene** | PR merged. Execute post-merge teardown: delete local/remote branch, remove worktree, prune refs. | `git branch -d`, `git worktree remove`, `git fetch --prune` |

---

## 5. Teardown & Hygiene Checklist

Before declaring a task complete, verify:
- [ ] Linked GitHub issue is in state `CLOSED`.
- [ ] PR is in state `MERGED`.
- [ ] Local branch `<prefix>/<issue>-<desc>` is deleted.
- [ ] Remote tracking branch `origin/<prefix>/<issue>-<desc>` is deleted.
- [ ] Any temporary git worktree directory has been removed and pruned (`git worktree prune`).
- [ ] Working directory is clean on `main` (`git status --porcelain` is empty).
