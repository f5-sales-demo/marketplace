# GitHub 3.3.1 stable native viewport qualification

Campaign [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
child [#1598](https://github.com/f5-sales-demo/marketplace/issues/1598), and
qualification [#1823](https://github.com/f5-sales-demo/marketplace/issues/1823).
The [historical installed and workflow receipt](github-1695-installed-20261020.md)
remains unchanged, including its separate guarded read-only workflow evidence.

## Independent immutable and installed binding

Stable tag `github/v3.3.1` resolves to merged source
`27a346ea488612a156a44574cc230056a63f6522`. Independent fresh GitHub API
archive downloads on Mac and Ubuntu have SHA256
`dd5795332d675349f37c1f06dec711c7797e7a35d52cbb5d44126d97393c4af9`.
All 60 shipped files match Git source, downloaded archive and the freshly
resolved registry-selected installed cache byte for byte on each host.

Both sessions use the latest verified stable xcsh 23.9.5. Mac executable SHA256:
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
Ubuntu executable SHA256:
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Default and discovery runtimes remain preserved. No plugin version or dependency
change is required for this qualification-only receipt.

An initial codeload download on each host used a different archive format and
failed the historical digest check. Those rejected archives remain private.
The changed download uses the original GitHub API endpoint and verifies the
original digest and all source/installed file contents independently.

## Individual native buffers and viewport pages

The published binary's actual `ToolExecutionComponent` renders the installed
plugin. Twenty-one unchanged fixture cases cover all eighteen tools: repository,
issue, pull request, search, diff, help, execution, checkout, push, watch,
workflow and worktree results, plus failed, malformed and empty output.
Fixture mode denies execution for every case, including mutation paths.
No GitHub service operation or model workflow executes in these captures.

Each case covers 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd. Every complete buffer is inspected individually, and every
viewport page is checked against its clamped offset and source rows. Final-page
overlaps agree; reconstruction equals the complete buffer. Historical literal
and occurrence expectations remain unchanged.

Fixture SHA256:
`18a18c9eddbf1333b64fa4f9182efe0f5d51c720ba3f91712653bced63d04f0f`.
Expectation SHA256:
`2435e874019cfb612d8601b8346a5780bc555e2877efbf0736cae09da195040d`.
Cases preserve thirteen-row evidence with twelve-row summaries, identity/scope,
zero, false, unknown state, literal corrections and complete text markers once.
Theme and symbol controls change within each running capture session.

| Host | Native buffers | Viewport pages | Failures | Terminal geometry |
| --- | --- | --- | --- | --- |
| Mac | 1,008 | 1,278 | 0 | 159 columns by 51 rows |
| Ubuntu workstation | 1,008 | 1,278 | 0 | 159 columns by 51 rows |

Both journals record one capture closure and one session shutdown, with zero
tool executions. Foreground process inspection verifies both owned panes
returned to their shells. Tracker, inventory and ownership checks passed on both
hosts: 12 tests and 506 assertions each. Every non-GitHub tracker row is preserved.

## Shared delivery prerequisite and remaining gates

The tested checker repair is
`494e84bdd8e5695bda7222c2ce7a10ca44f6506a`, captured from branch head
`22039baa6387ac86c3eadb020165e9a75741b6f1`. Native acceptance remains BLOCKED
until [PR #1812](https://github.com/f5-sales-demo/marketplace/pull/1812) merges
and these preserved captures pass independent inspection using delivered source.
No shared gate is completed by branch inspection.

Commands, skills, agents, lifecycle, watch progression, cancellation, context
replacement, late updates, exact Bash/Zsh argv and physical readability require
separate evidence. Observer cleanup does not establish plugin progress cleanup.
Historical guarded read-only workflows remain separate; account-dependent gates
remain deferred by the user. No authentication, deployment, meeting join,
external communication or delegation occurred.

Private evidence identifiers are `github-1823-stable-darwin-20261021-r23` and
`github-1823-stable-linux-20261021-r23`. Initial archive failures remain in the
corresponding `r22` directories. Raw files, journals and captures remain private.
Keep campaign #1579 and child #1598 open. Retire only task-owned resources after
merged receipt delivery and preservation of evidence.
