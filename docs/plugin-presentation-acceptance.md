# Plugin presentation acceptance

The 23-plugin catalog uses the shared presentation API. The current verified
stable development and installed qualification runtime is xcsh 23.9.3
(checked 2026-10-20). Registration discovery remains pinned to 23.8.0;
each changed plugin also runs a separate lane at its declared minimum runtime.
These lanes establish different evidence and must be recorded separately.
Executable plugins provide
presentation data; xcsh owns terminal layout, preview policy, theme and fallback
rendering. Content and integration plugins use the shared message and lifecycle
surfaces.

## Reproducible synthetic checks

Use the repository-pinned Bun 1.4.2. Run:

```sh
PUPPETEER_SKIP_DOWNLOAD=true bun install --frozen-lockfile --cwd scripts/agent-validation-runtime
bash scripts/check-plugin-runtime-dependencies.sh
bash scripts/check-ci-bun-lockfile-compatibility.sh
bash scripts/run-plugin-tests.sh
bash scripts/validate-plugins.sh
bash scripts/check-tests-are-hermetic.sh
```

The plugin runner exercises every catalog plugin through the pinned published
runtime's discovery loader with synthetic executable availability. It checks presentation registration,
zero, false and null values without executing cloud commands. Plugin suites
cover domain mappings and integration lifecycle fixtures.

If a fresh worktree lacks plugin dependencies, materialize its generated graph
from frozen locks using `bash scripts/check-plugin-runtime-dependencies.sh --repair`.
Review the affected graph first: repair rebuilds generated runtime-plugin
`node_modules`. It does not repair credentials or prove installed acceptance.
Run `bash scripts/run-plugin-minimum-runtime.sh <plugin>` for changed runtime plugins.

The historical shared renderer regression suite and synthetic ANSI captures are in
[xcsh PR #4874](https://github.com/f5-sales-demo/xcsh/pull/4874). They cover
40, 76, 120 and 153 columns, both themes, symbol presets, expanded output,
renderer failures, Unicode, tables and lifecycle/setup controls.

## Installed catalog qualification

Use the catalog-driven observer and explicit per-plugin scenarios described in
[the shared contract](shared-presentation-contract.md#catalog-driven-qualification).
Fixture mode renders synthetic results through the published binary's real
`ToolExecutionComponent` and blocks tool execution. Service mode observes normal
dispatch under exact tool, argument and target restrictions. Review entrypoint
initialization and scenario semantics before either mode.

Inspect every exposed surface at 40/76/120/153 columns, collapsed/expanded,
dark/light and Unicode/ASCII/Nerd. Record each frame's findings. Native buffer
checks do not establish viewport scrolling, shell copying, progress advancement
or cleanup. Retain separate evidence for live appearance changes, cancellation,
shutdown, context replacement and late updates where progress exists.

Run safe shipped commands, skills and agent guidance separately, recording actual
tool choices, results and conclusions. Instructions rendered or read successfully
do not prove their workflow executed. Fixtures may cover mutating paths;
presentation acceptance does not authorize infrastructure changes, authentication,
meeting joins, destructive operations or external communications.

Verify release/tag identity, independently downloaded bytes and digests before
checking installed versions, files and resolved executables on Mac and Ubuntu.
Unsupported service hosts and missing credentials remain separate blockers with
an exact next action. Publish sanitized receipts and retain raw captures privately.
Update only canonical tracker IDs supported by current evidence; preserve prior
receipts and record explicit retirements. Keep #1579 open until every current gate
is VERIFIED or legitimately NOT APPLICABLE.

## Salesforce qualification and historical scenarios

Salesforce 2.3.15's completed qualification and historical receipts remain in the
[canonical tracker](marketplace-presentation-todo.md#plugin-salesforce).
Do not reopen or repeat them merely to qualify another plugin. Live Salesforce
service probes run only on the corporate MDM MacBook; Ubuntu installation and
fixture checks cannot establish Salesforce service access.

The 14 synthetic scenarios in `plugins/salesforce/benchmarks/prompts.json` cover
project evidence, account ambiguity, opportunity details, all six tools, partial
results, unavailable orgs and the read-only guard. Use the fixture Salesforce CLI
for those scenarios; it does not provision or modify infrastructure.

Use identical model, theme, Salesforce context and viewport for installed,
Bun development and packaged comparisons. Live reads:

```sql
SELECT COUNT(Id) total FROM Opportunity WHERE Id = null
```

The collapsed result must show `total = 0`. Query
`DefinitelyMissingDemoField__c` to check readable error guidance. Exercise org
display, describe, pipeline report, help and exec; expand, scroll and resize the
transcript. Review setup commands and cancel the review without executing setup.

Live output is kept outside the repository. Public renderer fixtures use
synthetic identities and records.
