# MEDDPICC 7.8.2 complete installed guidance

Campaign #1579, child #1586, focused qualification #1789.

## Installed provenance and scope

Both hosts use installed MEDDPICC 7.8.2, immutable source
`07ac50f83601855c0b2942e2ff96d2b87a818476`, and qualification runtime
`~/.xcsh/qualification/23.9.5/bin/xcsh`. The independent all-file
publication and installation evidence is recorded separately under #1787.
Mac runtime SHA256 is
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`;
Ubuntu runtime SHA256 is
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Discovery remains 23.8.0; the default runtime remains 23.9.3.

The installed files and admitted selectors are identical on both hosts:

| Installed skill | Exact selectors | File SHA256 |
| --- | --- | --- |
| `skills/deal-review/SKILL.md` | `L1-L300`, `L301-L317` | `d32d8c68c41488f20d8ce934f3c31e3f19124736abb94d3f98d8d6d293758e32` |
| `skills/deal-qualification/SKILL.md` | `L1-L300`, `L301-L437` | `33fb10a40ace1ff91b9729dd0338192f5f02d5706193ab473fbd250f64a925b0` |
| `skills/deal-update/SKILL.md` | `L1-L300`, `L301-L390` | `2034a2427d1b646934f9d3fc8dd0f7b81add003608ee648ce8f98bfaa9330a59` |

Each exact read argument contains the installed absolute path, selector and
`timeout: 120`. The scenario binds every path and range to its file digest.
Only the read tool is enabled; other tools, paths and arguments are rejected.
Native skills, rules, memories, LSP and PTY tools are disabled for this lane.
No deals, accounts, shell commands, Excel, delegation or external services run.

Scenario SHA256: Mac
`b0c95d672ce63961357c1c4febea6216f6902108c202afbb756acb7d202ba3ac`;
Ubuntu
`a9aa44feaae58c98a9e7a29b67b64198ea99e3fb16d1b8e523fd213d9132bcca`.
Host-specific installed paths account for the distinct scenario hashes.

## Actual model selection and conclusions

On each host the model selected exactly six permitted reads, once each.
All succeeded without a guard rejection. Calls and execution results were
joined by tool-call ID; every returned selected line matches installed source,
including the terminal empty line. Both final conclusions report the exact
six windows and no unread range.

Both conclusions distinguish identity, exact deal/file and workflow scope,
stage completion, observed evidence, engine results, estimates and proposals.
They preserve instructions about zero, false, empty strings, unknowns, units,
incremental writes, confirmation, conflict handling and workbook read-back.
Both explicitly identify this as manually interpreted installed guidance and
exclude native skill invocation, executed deal workflows and Excel acceptance.
Neither claims rendering acceptance from successful reads.

## Native capture and individual inspection

After normal read dispatch and model completion, the observer captures the
actual read results through the published runtime's `ToolExecutionComponent`.
The final assistant message is captured separately through its native component.
Each host has 288 guidance frames and 48 assistant frames: all
40/76/120/153 column widths, collapsed/expanded states, dark/light themes and
Unicode/ASCII/Nerd presets for each of six ranges and one conclusion.

All 672 frames across both hosts pass structural width and outcome checks.
Each guidance frame was inspected separately. Every one of the 288 expanded
guidance frames contains the complete ordered selected source payload after
normalizing framing and whitespace. Collapsed previews are separate from that
complete-evidence claim. Each of the 96 assistant frames preserves all range
endpoints, no-unread-range result, identity/scope/completion/evidence guidance,
and the manual/native/workflow/Excel/rendering acceptance boundary.

Both guidance and assistant captures close successfully on each host.
Session shutdown is observed before the owned terminal returns to shell.
These captures qualify the three skills' installed guidance capture gates;
executed workflow, default/layout/outcome/fidelity/expansion acceptance and
supported-host Excel behavior retain their independent gates.

## Preserved failures and remaining work

The first Mac attempt remained queued at Herdr admission with zero model calls.
Its evidence was preserved; the owned pane was shut down and retired before a
fresh pane was created. Raw terminal submission then sent each guarded prompt
once after observer readiness, without duplicating the queued admission.

A second Mac attempt used Python line endpoints that omitted each file's final
empty line. Six reads succeeded and 288 selected-range frames passed, but the
model correctly reported unread lines 317, 437 and 390 with unknown contents.
That partial candidate remains preserved and does not support complete coverage.
The corrected fresh candidates above include those lines. Audit implementation
errors were corrected against saved evidence without repeating model execution.

Private evidence roots use the names
`meddpicc1789-guidance-{mac,ubuntu}-20261021-complete-eof`.
Earlier Mac roots have no suffix or suffix `-direct-terminal`.
Raw prompts, paths, source payloads, events, frames and failed attempts stay private.

Next actions: run narrowly guarded installed synthetic deal workflows through
the normal runtime and native skill path; qualify every applicable outcome,
layout, evidence and lifecycle variant. Perform Excel acceptance separately on
its supported host. Account-dependent service work remains deferred.
Historical receipts and invalidations remain preserved. Child #1586 and
campaign #1579 remain open.
