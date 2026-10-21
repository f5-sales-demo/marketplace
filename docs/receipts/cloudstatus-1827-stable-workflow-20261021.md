# Cloudstatus stable installed workflow receipt

Campaign #1579; Cloudstatus #1592; scoped qualification #1827.
This receipt preserves [the earlier 23.9.3 workflow and failures](cloudstatus-1702-installed-20261020.md).
It establishes one actual Ubuntu overall-status workflow, its native results and
conclusion, and the two full guidance files read during that workflow. Complete
Cloudstatus service and presentation acceptance remain blocked.

## Independently verified installed candidates

Both hosts independently downloaded `cloudstatus/v1.9.2`, resolved tag source
`8e29fc09e12822acaf2b7126a085d8de66fee30f`, and compared all 36 plugin files
against source and the currently installed plugin. Archive SHA256:
`52d3b3e49a3728c700c6084fbc7f7b7247c2fc6ba7c917b139aabbe879f0ff44`.

Qualification uses the separately installed stable xcsh 23.9.5 binary, source
`3fc47cd286894e4a73e06fc0259ff98601b8a68f`. The immutable release and successful
publication run 39431858942 bind that source. Fresh platform provenance downloads
bind the current binaries independently on each host:

| Platform | Binary SHA256 | Provenance SHA256 |
| --- | --- | --- |
| Darwin arm64 | `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e` | `ffc92c6ffc311c05c698a385298e804670fed4b35a3d0334bd8ee38d63166b05` |
| Linux x64 | `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2` | `caa0f5c78bd93eeb3866a92d0f3c0548ba7b2bec7e70fdf415b7fbba3954c1ae` |

The stable source contains merged runtime PR #5040, commit
`ed7a8ece4c3be5f6485471f902b1f819f9f3b1bc`: fresh comparison reports six commits
ahead and zero behind. That change supplies bounded completed Bash output.
Runtime issue [#5039](https://github.com/f5-sales-demo/xcsh/issues/5039) remains
open for broader outcome, host and lifecycle acceptance. Default runtime 23.9.3,
minimum-runtime requirements and discovery fingerprint 23.8.0 remain preserved.

## Actual guarded execution

Scenario `cloudstatus-overall-stable-1827`, SHA256
`0ac8497afcf3107220a28eb45becfe65a9ced68191fe499cd3d1ba2279e14f41`, admitted exactly:

1. A complete read of `agents/cloudstatus-status-operator.md`.
2. A complete read of `skills/monitor/references/commands.md`.
3. One execution of that reference's `overall-status` Bash fence.

The fence SHA256 is
`31bc629824e95f66b71ff4bf90b97090dfc1d53829ed22443a81fc5bb60ce8e4`.
Effective environment is `STATUSPAGE_URL=https://www.f5cloudstatus.com`, timeout
30 seconds, description `Collect overall F5 cloud status once`. Execution used
the exact admitted command and completed with exit zero in 268 milliseconds.
The journal has three unblocked tool calls and three non-error results, one
agent start and one agent end. No additional execution was admitted.

The result reports page F5, indicator `maintenance`, and description
`Service Under Maintenance`. Collection time is `2026-10-21T09:55:30Z`; source
page update time is `2026-10-21T09:29:17.867Z`; source endpoint is
`https://www.f5cloudstatus.com/api/v2/status.json`. The final text agrees with
both timestamps, states successful collection and one execution, and explicitly
limits the conclusion to page-wide status. Affected services, maintenance
details and completion ETA were not collected. This observed status is a
historical result, not a claim about current service health.

## Individual native buffers and viewport pages

The real published runtime components produced 96 result/conclusion buffers
and 96 viewport pages. The two separately captured full guidance reads produced
96 buffers and 468 viewport pages. Every case covers 40/76/120/153 columns,
collapsed/expanded, dark/light and Unicode/ASCII/Nerd presets. Actual remote
terminal geometry was 60 columns by 40 rows, with 38 viewport rows. Every buffer
received identity, width, outcome and literal checks; every page received row,
offset, overlap and complete reconstruction checks.

All 48 Bash buffers pass, including the previously failing collapsed output.
The initial inspection found 24 conclusion failures because the inspector did
not reconstruct unframed assistant paragraphs. Saved rows contain the intact
limitation split across visual rows. A failing behavioral regression reproduced
that inspector defect; the repair reconstructs assistant paragraphs while
preserving blank, heading, list, rule and structured-data boundaries. Checker
commit is `0cf542f60d6aefc916c39cd5ed34a907e8505f48`. It also
checks wrapped forbidden values and exact occurrence counts. Reinspection of
all original immutable buffers/pages with unchanged expectations passes.
The original failed inspection remains private and preserved. Shared checker
[PR #1812](https://github.com/f5-sales-demo/marketplace/pull/1812) must merge;
independently reinspect the preserved evidence using its delivered source
before promoting dependent capture/layout gates.

The earlier operational-status expectations remain untouched. Fresh explicit
expectations bind the actually observed maintenance status and current model
wording. Result checks SHA256:
`bc44026a092af88136924922ae07669b1c876ea26117b39215ca956b652686cb`.
Guidance checks SHA256:
`0845b4a5964d5a4fae5d00070bec209cc332b0ea27095815d851d8a56f0138e4`.
Private frame manifest SHA256:
`deaf871f25a89562cd6d27b520557baefb79b7f50e6fadb395159d965605b8cc`.
Operator source SHA256:
`3b8609a03f62631c369b2aee5fa2a7e164d0141c666a1c2de98d3e7e0fd4e2fe`.
Command reference source SHA256:
`6fb0d3ac912f4368806f296c39307cbd4d3fd05276c35d7c0533952a7d3452aa`.

## Preserved failures, cleanup and remaining gates

An initial local pane running SSH could display the remote TUI but could not
admit an agent prompt (`agent_not_found`). No model or tool execution occurred;
that observer shut down and its journal remains private. The existing remote
Herdr profile then admitted the scoped prompt once. Although it reported
stalled admission, subsequent journal events proved normal dispatch and
completion. The prompt was not retried.

The successful observer closed both capture UIs exactly once and recorded one
session shutdown. Its task-owned remote pane returned to the shell and original
worktree. This proves observer cleanup only. Cancellation, late updates,
context replacement, plugin lifecycle and progress acceptance remain separate.
Task-owned panes and both issue worktrees await merged receipt delivery before
retirement; unrelated sessions and panes remain preserved.

The previous Mac submission remains an admission prerequisite. Inspect that
existing submission after normal capacity releases; do not resubmit or bypass
it. Other status workflows, network/location guidance, commands, advisories,
lifecycle surfaces, all outcome cases, exact Bash/Zsh argv reconstruction and
terminal readability remain unqualified. Guidance rendering does not establish
execution of those workflows, and the captured commands reference is not the
entire monitor skill. Account-dependent gates elsewhere remain user-deferred.

The checker repair passes 62 focused tests and 388 assertions on each host,
full Ubuntu plugin tests, hermeticity, changed-file hooks and privacy enforcement.
Salesforce evidence and all historical failures remain preserved. Campaign #1579
stays open.
