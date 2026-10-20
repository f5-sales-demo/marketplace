# GitLab 1.5.2 publication and installed qualification

Campaign #1579, child #1597, implementation #1694 / merged PR #1697,
installed qualification #1699. Source: `0e4800cfaf236d17ef741a86dca54b6aa8926f19`.

## Delivered source and immutable artifact

All required implementation CI checks passed. Stable release `gitlab/v1.5.2`
resolves to the merge commit. The independently downloaded source archive has
SHA-256 `73d853a770ce59d659785f074abbc539c57ad181ba6ad8326db10852f15e5e13`.
All 56 tracked GitLab files match the immutable source. The release workflow
completed successfully; publication and installed acceptance are separate gates.

Normal `xcsh plugin upgrade gitlab@f5-sales-demo-marketplace` succeeded on Mac
and Ubuntu. Each actual installed registry selects 1.5.2, and all 56 installed
files match the archive/source digests. Both resolved runtimes report 23.9.3.
Mac resolves the published Homebrew Cask binary and glab 1.123.0; Ubuntu
resolves `~/.local/bin/xcsh` and `/usr/bin/glab`. Credentials were preserved.

## Installed rendering and workflow evidence

Fresh installed fixture captures use the published runtime's real
ToolExecutionComponent, without a source registry override. Eight cases across
all five tools passed 384 individually inspected native-buffer frames per host:
40/76/120/153 columns, collapsed/expanded, dark/light and Unicode/ASCII/Nerd.
Baseline failures and source captures remain private and unchanged.

Bounded component viewport inspection passed 792 pages on Mac and 570 on
Ubuntu with zero failures. Different terminal heights explain the page counts.
The first
controller attempt received no acknowledgement because a previous finish
control remained; preserve its failed log. The corrected attempt resets that
control before opening the capture UI. These controller-selected pages do not
prove keyboard scrolling of the normal transcript.

A guarded Mac model workflow first requested an unapproved file selector, which
was blocked. It then successfully read the entire installed help guidance using
approved exact arguments, executed glab_help for `issue list`, and concluded
from the actual returned CLI help. The initial rejected read remains in the
journal. No issue query or authentication was attempted. Other shipped guidance
and Ubuntu executed-workflow acceptance remain open.

## External prerequisite and remaining gates

Read-only `glab auth status` exits 1 on both hosts. Raw stdout/stderr remain
private; authenticated issue list/view/search service acceptance is BLOCKED.
Next action: the account owner restores existing CLI authentication on each host,
verifies `glab auth status` and `glab api user`, then rerun narrowly scoped safe
reads against an authorized existing project. No authentication was attempted.

Complete all remaining outcome cases, normal transcript viewport and keyboard
scrolling, lifecycle and progress cleanup where exposed, command/message/
advisory surfaces, live appearance acceptance and every safe shipped workflow.
The minimum 23.5.1 lane and current 23.9.3 plugin tests passed in implementation;
Ubuntu full-suite and hermeticity checks passed. Existing Mac KVM/Xorg/Zoom
failures are retained separately. This receipt does not close #1597 or #1579.
Task-owned pane/worktree cleanup follows receipt delivery; unrelated work stays.
