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

- **Remote Base Freshness**: Execute `git fetch --prune` and confirm remote alignment before planning, branching, or editing. Create a fresh worktree and issue-numbered feature branch from `origin/<default-branch>` to guarantee a current base ref.
- **Issue Linkage**: Open a detailed issue (problem, scope, objective acceptance criteria) before branching. Link every PR using `Closes #<issue>` in the description to ensure automated tracking.
- **Incremental Verification**: Run local test and lint checks after every modification. Validate changes with empirical command output before claiming completion.
- **Clean Landings**: Land changes on the protected default branch via pull requests with auto-merge enabled. Retire completed worktrees and confirmed-merged local branches cleanly.

</workflow>

<review_routing>

## Review routing

- **Specs/Plans**: Run `bash scripts/agy-review.sh document <file>` to review plans or specs before implementation.
- **Pre-Push Code Gate**: Run `bash scripts/agy-pre-push-review.sh` prior to PR push. Resolve any findings so the exact HEAD passes cleanly.

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
