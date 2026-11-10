# GitLab 1.5.2 stable native viewport qualification

Campaign [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
child [#1597](https://github.com/f5-sales-demo/marketplace/issues/1597), and
qualification [#1825](https://github.com/f5-sales-demo/marketplace/issues/1825).
The [historical installed and workflow receipt](gitlab-1699-installed-20261020.md)
remains unchanged, including its separate guarded read-only workflow evidence.

## Independent immutable and installed binding

Stable tag `gitlab/v1.5.2` resolves to merged source
`0e4800cfaf236d17ef741a86dca54b6aa8926f19`. Independent fresh GitHub API
archive downloads on Mac and Ubuntu have SHA256
`73d853a770ce59d659785f074abbc539c57ad181ba6ad8326db10852f15e5e13`.
All 56 shipped files match Git source, downloaded archive and the freshly
resolved registry-selected installed cache byte for byte on each host.

Both sessions use the latest verified stable xcsh 23.9.5. Mac executable SHA256:
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
Ubuntu executable SHA256:
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Default and discovery runtimes remain preserved. No plugin version or dependency
change is required for this qualification-only receipt.

## Individual native buffers and viewport pages

The published binary's actual `ToolExecutionComponent` renders the installed
plugin. Eight unchanged fixture cases cover all five tools: issue list,
issue view, search, help and execution, plus empty, partial, failed and malformed
output. Fixture mode denies execution for every case, including mutation paths.
No GitLab service operation or model workflow executes in these captures.

Each case covers 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd. Every complete buffer is inspected individually, and every
viewport page is checked against its clamped offset and source rows. Final-page
overlaps agree; reconstruction equals the complete buffer. Historical literal
and occurrence expectations remain unchanged.

Fixture SHA256:
`e2c8f23cfbb9df8fb0d4ba6e89278b2339b679cb7c6e15b47f05ff081c2add31`.
Expectation SHA256:
`6029d678485cac0806884cb8452a0f9564e64942571bf962238f7cdd347679c4`.
Cases preserve thirteen-row evidence, identity/scope, zero, false, literal
corrective guidance and complete text markers with their original expectations.
Theme and symbol controls change within each running capture session.

| Host | Native buffers | Viewport pages | Failures | Terminal geometry |
| --- | --- | --- | --- | --- |
| Mac | 384 | 486 | 0 | 159 columns by 51 rows |
| Ubuntu workstation | 384 | 486 | 0 | 159 columns by 51 rows |

Both journals record one capture closure and one session shutdown, with zero
tool executions. Foreground process inspection verifies both owned panes
returned to their shells. Tracker, inventory and ownership checks passed on both
hosts: 12 tests and 506 assertions each. Every non-GitLab tracker row is preserved.

## Shared delivery prerequisite and remaining gates

The tested checker repair is
`494e84bdd8e5695bda7222c2ce7a10ca44f6506a`, captured from branch head
`22039baa6387ac86c3eadb020165e9a75741b6f1`. Native acceptance remains BLOCKED
until [PR #1812](https://github.com/f5-sales-demo/marketplace/pull/1812) merges
and these preserved captures pass independent inspection using delivered source.
No shared gate is completed by branch inspection.

Commands, skills, agents, lifecycle, plugin progress, cancellation, context
replacement, late updates, exact Bash/Zsh argv and physical readability require
separate evidence. Observer cleanup does not establish plugin progress cleanup.
The historical Mac help workflow remains separate. Account-dependent service
gates remain deferred by the user; no authentication was attempted. When resumed,
the account owner must restore existing CLI authentication on each host, verify
`glab auth status` and `glab api user`, and rerun scoped issue reads. No authentication, deployment, meeting join,
external communication or delegation occurred.

Private evidence identifiers are `gitlab-1825-stable-darwin-20261021-r24` and
`gitlab-1825-stable-linux-20261021-r24`. Raw files, journals and captures remain private.
Keep campaign #1579 and child #1597 open. Retire only task-owned resources after
merged receipt delivery and preservation of evidence.
