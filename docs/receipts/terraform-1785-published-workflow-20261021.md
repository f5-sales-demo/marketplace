# Terraform published workflow qualification

Campaign #1579, child #1601, receipt delivery #1785.

## Independently verified provenance

Terraform 2.3.1 implementation PR #1743 is MERGED with all four required
checks successful. Immutable tag `terraform/v2.3.1` resolves to source
`de55da7377227c8b9baef495b3bbc1e7325aed29`.
Independent downloads on Mac and Ubuntu have archive SHA256
`7d00c523851094e606b5a59806fa44e3153d7b77fa6bbb67d6193dc08deae699`.
All six shipped files match source, archive and each host's installed plugin.
The installed testing skill SHA256 is
`887ebec5bbecb1d5c30252c70a5f868d89b8edb1a8369028a58d929e4538cb9d`.

Both hosts separately resolve qualification executable
`~/.xcsh/qualification/23.9.5/bin/xcsh`.
Mac executable SHA256 is
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`;
Ubuntu executable SHA256 is
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
The default executable remains 23.9.3 on each host. Historical discovery
runtime 23.8.0 remains unchanged. Observer source is
`a6b19bf0c5f998db2f8921c346f545055880a3f6`.
Mac and Ubuntu are supported; no unsupported-host exemption is claimed.

## Exact guarded workflow

The scenario admits one complete installed testing-skill read and one exact
Bash call containing its complete **Safe Local Plan Fixture** fence.
The fence SHA256 is
`0dcb6609b7bfc383c68fc0522f6fc307f3bd796fea59449228c150d44a7e9169`.
Bash arguments bind an empty environment object, timeout 120, description
`Run resource-free Terraform plan fixture` and the physical scenario directory.
No additional commands, tools, providers, backends or account access are admitted.
The shipped fence creates only a temporary resource-free local fixture,
uses a clean Terraform environment and an empty CLI config, and declares
`command = plan`. Its exit trap removes the temporary directory.

Earlier attempts rejected model-selected description and working-directory
fields. Those failed attempts remain private. The new candidate binds those
fields exactly rather than allowing arbitrary execution. Observer readiness
was verified before each prompt. Results were joined by tool-call ID.

### Ubuntu successful execution

Scenario SHA256:
`887615cea681238bb850905de7367e28a25a18dea92d75604645e14ecdc73f56`.
Exactly two admitted calls succeeded: complete installed source read and exact
shipped Bash fence. There were no extra or blocked calls. Bash exited zero;
formatting passed, backend-disabled initialization succeeded, validation
succeeded and `summary_plan` reported `Success! 1 passed, 0 failed.`.
The plan assertion proves numeric `0`, boolean `false` and string `""`
survive in this fixture's planned output.

The assistant concluded local fixture correctness and explicitly distinguished
manual interpretation of installed guidance from native skill invocation.
It did not establish infrastructure or service acceptance. Its cleanup claim
is not an independent observation of temporary-path deletion: the generated
path was not exposed for an independent post-run probe.

All 96 registered tool/message frames passed individual nonempty and width
checks. Each of 48 assistant frames retained target, actual result counts,
literal values and the native-invocation and service boundaries.
Another 48 installed-guidance frames passed individual structural checks.
The guidance driver initially targeted the completed workflow root and timed
out awaiting an acknowledgement. That failure is preserved; targeting the
active guidance directory completed capture without repeating the model.

### Mac refused execution

Scenario SHA256:
`639cc4a399874cda30f7cb969db10184c362ba91674bb77f1da8a559eea7dd20`.
One admitted installed source read succeeded. The assistant then refused the
fence, citing its mandatory tool-use rules concerning shell file writes and
`cd`. No Bash call was attempted; zero fixture executions occurred.
Formatting, initialization, validation and test outcomes remain unverified.
The response preserved `0`, `false`, `""` as assertion intent, distinguished
manual interpretation from native invocation, and declined service acceptance.
The unchanged candidate was not retried.

All 48 refusal message frames passed individual nonempty and width checks;
each retained zero executions, unverified outcomes and literal assertion intent.
Another 48 guidance frames passed individual structural checks.
Mac executed workflow acceptance remains BLOCKED: reconcile the runtime's
mandatory tool-use rules with the exact authorized resource-free shipped
fixture, then run a changed candidate with the same narrow argument guard.

## Capture boundaries and remaining work

The 240 individually inspected frames cover 40/76/120/153 columns,
collapsed/expanded, dark/light and Unicode/ASCII/Nerd. Appearance controls
changed the live component theme and symbol preset. Structural guidance
checks do not establish complete rendered fidelity, scrolling, native
skill invocation or human terminal-font readability.

Both workflow and guidance captures closed on each host; session shutdown
was observed before return to the task-owned shell. Raw captures, sessions,
source comparisons and failed attempts remain private under roots named
`terraform1785-installed-plan-{mac,ubuntu}-20261021` and
`terraform1785-independent-{mac,ubuntu}-20261020`.

Only scoped capture and independently verified merge/artifact/installed-host
provenance are supported. Authoring and troubleshooting workflows, empty,
unavailable, partial, failed and malformed scenarios, full guidance fidelity,
expanded evidence, exact rendered command reconstruction and lifecycle
acceptance remain open. Independent temporary-path removal is unverified.
No accounts, infrastructure changes, service setup, meetings or external
communications were exercised. Historical Terraform receipts and tracker
invalidation records remain preserved; child #1601 and #1579 stay open.
