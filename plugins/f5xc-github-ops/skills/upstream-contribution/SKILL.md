---
name: upstream-contribution
description: >-
  Upstream contribution workflow for fork-based development — fork
  detection, upstream research (issues, PRs, CONTRIBUTING.md, CI
  patterns), cross-repo issue and PR creation, local tracking issue
  management, upstream CI monitoring, and guided resolution (merge,
  rejection, stale).
  Use when the user says "contribute upstream", "submit to upstream",
  "fork PR", "upstream PR", "push to upstream", "create upstream issue",
  "check upstream status", "update tracking", "sync from upstream",
  "upstream research", or "what's happening upstream".
  Also activates when the user wants to create a PR targeting a
  parent/upstream repository from a fork, or needs to check the
  status of an existing upstream contribution.
  Requires the current repository to be a GitHub fork.
  All operations are delegated to the github-ops subagent.
user-invocable: false
---

# Upstream Contribution Workflow

This skill manages the lifecycle of contributing code from a local
GitHub fork to the upstream (parent) repository. It coordinates
four phases: Research, Contribute, Track, and Resolve.

ALL upstream Git and GitHub operations MUST be delegated to the
`github-ops` agent. The main session MUST NOT directly run
cross-repo `gh` commands.

## Phases

| Phase | When | What happens |
| ----- | ---- | ------------ |
| Research | User says "contribute upstream" | Fork detection, search upstream issues/PRs, read CONTRIBUTING.md, check CI patterns |
| Contribute | Research passes (PROCEED) | Create upstream issue, upstream PR from fork, local tracking issue |
| Track | User says "check upstream status" | Poll upstream PR state, update local tracking issue |
| Resolve | Upstream PR reaches terminal state | Guided cleanup with user confirmation |

## Phase 1: Research

Before contributing anything upstream, the agent must research
the upstream repository to avoid duplicates and understand
contribution requirements.

Delegate with:

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  mode="bypassPermissions",
  prompt="upstream-research: <keywords describing the contribution>

Upstream: <owner/repo>

Why: <motivation for the contribution>"
)
```

The agent will:

1. Verify this repo is a GitHub fork
2. Search upstream issues (open + closed) for similar work
3. Search upstream PRs (open + closed + draft) for competing work
4. Read upstream CONTRIBUTING.md for contribution requirements
5. Check upstream CI/automation workflows
6. Return a Research Report with a go/no-go recommendation

**If the agent returns `REVIEW_NEEDED`:** Present the research
findings to the user. Similar issues/PRs were found upstream.
The user must decide whether to proceed, modify the approach,
or abandon the contribution.

**If the agent returns `PROCEED`:** Move to Phase 2.

## Phase 2: Contribute

After research passes, delegate the contribution:

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  mode="bypassPermissions",
  prompt="upstream-contribute: <type>: <description>

Upstream: <owner/repo>
Branch: <local-branch-name>

Files:
- <file-list>

Why: <motivation>
Research: <summary of research findings and contribution requirements>"
)
```

Optional fields:

- `Upstream-Issue: <owner/repo>#<number>` — skip upstream issue creation
- `Upstream-PR: <owner/repo>#<number>` — skip upstream PR creation

The agent will:

1. Create an upstream issue (following upstream's templates/conventions)
2. Push the branch and create an upstream PR from the fork
3. Create a local tracking issue in the fork repo
4. Monitor upstream CI checks
5. Return: upstream issue #, upstream PR #, local tracking issue #

**Caller verification:** After the agent returns, verify all three
artifacts (upstream issue, upstream PR, local tracking issue) are
present in the response. If any are missing, treat as a failure.

## Phase 3: Track

When the user asks to check on an upstream contribution:

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  mode="bypassPermissions",
  prompt="upstream-status:

Upstream-PR: <owner/repo>#<number>
Tracking-Issue: #<local-tracking-issue-number>"
)
```

The agent will:

1. Check upstream PR state, reviews, and CI status
2. Detect bot/automation comments
3. Post a status update on the local tracking issue
4. Return a status report

## Phase 4: Resolve

When tracking reveals a terminal state (merged, closed, or stale):

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  mode="bypassPermissions",
  prompt="upstream-resolve:

Upstream-PR: <owner/repo>#<number>
Tracking-Issue: #<local-tracking-issue-number>
Branch: <local-branch-name>"
)
```

The agent will propose cleanup actions. **Each action requires
user confirmation** — present them to the user before re-delegating
to execute confirmed actions.

**Merged:** Sync fork from upstream, close tracking issue, delete
local branches.

**Rejected:** Update tracking issue with rejection context, keep
issue open for potential rework.

**Stale (>30 days no activity):** Report stale status, keep
tracking issue open, suggest pinging upstream maintainers.

## Handling Agent Responses

| Status | Meaning | Your Action |
| ------ | ------- | ----------- |
| `COMPLETE` | Upstream operation finished successfully | Phase complete, report to user |
| `REVIEW_NEEDED` | Similar upstream work found | Present findings, let user decide |
| `FAILED` | Operation failed | Check failure reason, report to user |
| `BLOCKED` | Rate limit or auth issue | Resolve blocker, re-delegate |

## Worktree Awareness

Claude Code sessions frequently run inside Git worktrees for
isolation. The github-ops agent detects worktrees automatically
during its initialization (Step 2: Detect Worktree). All Git
operations in the agent use worktree-safe path resolution.

When delegating to the agent from a worktree:

- Branch operations work normally — worktrees share the same
  remote configuration as the main repository
- Push and PR creation work identically
- The agent resolves `.git` paths using `git rev-parse --git-path`
  instead of hardcoded `.git/` prefixes

No special handling is needed in the skill — the agent handles
worktree detection transparently.

## Rules

- **Research before contributing — no exceptions.** Never create
  an upstream issue or PR without first running the research phase.
- **Local tracking issues must NOT use `Closes` links** to local
  PRs — they must survive local merges and stay open until the
  upstream contribution resolves.
- **Follow upstream conventions.** The upstream's CONTRIBUTING.md,
  issue templates, and PR templates take precedence over our local
  conventions when creating upstream artifacts.
- **Guided cleanup only.** Never auto-close tracking issues or
  delete branches without user confirmation.
- **One upstream per invocation.** Each contribution targets a
  single upstream repository.
