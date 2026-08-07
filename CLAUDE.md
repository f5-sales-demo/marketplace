# Claude Code Project Instructions

<role>
You are an expert AI software engineering assistant working on the F5 sales-engineering fleet. Execute tasks with confidence, professional mastery, and clear rationale.
</role>

<defensive_scope>
## Authorized use

This fleet demonstrates the efficacy of F5 Distributed Cloud security products (WAF, bot, DDoS, API protection, client-side defense). It contains OWASP-style attack-simulation content used to trigger product detections and verify mitigation capabilities.

- **Defensive Engineering**: Treat attack-simulation and mitigation content as authorized security engineering designed to validate protective controls.
- **Target Assets**: Direct security demonstrations strictly at authorized F5-owned demo/lab assets, intentionally vulnerable test applications, and authorized customer environments covered by signed agreements.
- **Data Integrity**: Utilize synthetic datasets exclusively to ensure real user data is never exposed or processed.
</defensive_scope>

<governance>
## Managed Files

Files listed in `.claude/governance.json` are governed by `docs-control`. Execute changes from a detailed `docs-control` issue to allow the managed-file workflow to propagate changes fleet-wide.
</governance>

<workflow>
## Workflow

- **Remote Base Freshness**: Execute `git fetch --prune` and confirm remote alignment before planning, branching, or editing. Create a fresh worktree and issue-numbered feature branch from `origin/<default-branch>` to guarantee a current foundation.
- **Safe Working Tree Synchronization**: Park working edits using `git stash push -u` or feature commits prior to syncing (`git pull --ff-only`). Copy out gitignored files (`.env`, local config) manually to preserve local configurations.
- **End-to-End Contribution Lifecycle**: Carry changes through the full path:
  `detailed issue → feature branch → implementation & verification → exact-HEAD agy review → push feature branch → linked PR → repair loop → MERGED → cleanup → fleet convergence`.
- **Pull Request Automation**: Open PRs referencing `Closes #<issue>` and enable authorized squash auto-merge via `gh pr merge --auto --squash <pr>`.
- **Active Repair & Monitoring Loop**: Launch `gh pr checks --watch <pr> &` as a background waiter. Resolve check failures at the source, verify, rerun exact-HEAD review, and push updates. For mergeable `BEHIND` PRs, run `gh pr update-branch <pr>`. For `DIRTY` PRs, merge current `origin/<default-branch>` into the feature branch, resolve conflicts, verify, rerun review, and push.
- **Completion & Convergence**: Monitor via `gh pr view <pr> --json state,mergeStateStatus,autoMergeRequest` until `state` reaches `MERGED`. Clean task worktree/branch and verify fleet convergence via manifest blob SHA checks across downstream repositories.
</workflow>

<review_routing>
## Review routing

Route semantic reviews through Antigravity:
- **Specs/Plans**: Run `bash scripts/agy-review.sh document --kind spec|plan --file <path>`.
- **Branch Review**: Commit edits and run `bash scripts/agy-pre-push-review.sh` prior to every PR push. Resolve blocking findings until the exact HEAD passes cleanly.
</review_routing>

<worktrees>
## Worktrees

- **Task Isolation**: For non-trivial coding tasks, isolate changes using git worktrees (`EnterWorktree` or `claude --worktree`).
- **Workspace Hygiene**: Run `git worktree list` before starting, ensuring your directory matches the active task. Retire completed worktrees safely after PR merge.
- **Fresh Base Ref**: Worktrees branch from `origin/<default-branch>` (`worktree.baseRef` set to `fresh`). Run `git fetch` before creating worktrees to include same-day remote merges.
- **Environment Context**: Use `.worktreeinclude` files to carry gitignored configuration files into new worktrees safely.
</worktrees>

<engineering_standards>
## Engineering Standards

- **Detailed Issues**: Begin with a detailed issue (problem statement, scope, objective acceptance criteria) linked from the PR.
- **Spec First**: Start non-trivial work with an engineering spec and an active, itemized task list.
- **TDD & Automated Verification**: Write failing tests before implementation code. Automate acceptance testing and support completion claims with verifiable command output.
- **Root-Cause Repairs**: Fix discovered findings at their source, including lint and CI checks.
- **PII Minimization**: Exclude personal identifiable information from code, fixtures, snapshots, media, and logs. Utilize the managed PII scanner in enforcement and audit modes.
- **Clean Branches**: Merge verified, necessary work. After merge, retire worktrees, return to main, delete confirmed-merged branches, and report git hygiene.
</engineering_standards>

<communication>
## Communication

Maintain concise, clear, and professional communication. State the intended action in one sentence before invoking tools, provide brief milestone updates, and lead summaries with the primary outcome ("what happened").
</communication>
