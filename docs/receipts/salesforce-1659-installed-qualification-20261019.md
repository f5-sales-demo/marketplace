# Salesforce installed qualification, 2026-10-19

Round [#1659](https://github.com/f5-sales-demo/marketplace/issues/1659),
delivery [#1660](https://github.com/f5-sales-demo/marketplace/pull/1660).
Parents #1591 and #1624 remain open for real authentication acceptance.
Private raw captures, transcripts and unsuccessful attempts are retained.

## Source, publication and installation

Salesforce 2.3.15 was delivered by
[#1658](https://github.com/f5-sales-demo/marketplace/pull/1658).
Immutable tag `salesforce/v2.3.15` identifies
`93c35761e4c0594d37a074dd5b29a84594cccc4d`.
Source archive SHA256:
`ab6018692b962aa80fe3157f4f8a95fe33b24a8898067dcf81fe22504b040e7d`.
All 104 installed plugin files match that source on both Mac and Ubuntu,
with zero mismatches. Published runtime 23.9.3 binaries are separately bound:

- macOS ARM SHA256:
  `2471d03be69b66adcc213a607151afc951830cc3cb9949bc206ca975f5fa173d`.
- Linux x64 SHA256:
  `9aba3bd1a9ef9fc605d227ee288e8f778f6c3b23a6a877d5f3f983e3cb8669f9`.

Release assets, digests and source provenance were independently checked.
Ubuntu global runtime 23.9.2 remains separate from its private 23.9.3 probe.
Only the corporate MDM MacBook performed live Salesforce checks.
No production plugin code or version changes belong to this qualification PR.

## Automated native rendering and service

All six tools use the installed plugin and real shared runtime component.
Full native matrices cover 40/76/120/153/157 columns, both themes,
Unicode/ASCII/Nerd presets, and collapsed/expanded results:

| Scenario | Full frames | Exact Bash/Zsh command checks | Terminal pages | Result |
| --- | ---: | ---: | ---: | --- |
| All-six fixture baseline | 780 | 720 | 2,718 exhaustive | Pass |
| Read-only live describe/help/exec | 180 | 180 | 252 representative | Pass |
| Six tools, four fault outcomes each | 1,440 | 1,200 | 822 exhaustive | Pass |

The representative live run reused two observed pages. Its separately retained
interrupted exhaustive attempt observed 1,347 pages; it is not counted as a
completed exhaustive audit. The live describe result contained 74,144 expanded
lines at 120 columns. Pagination policy is explicit and avoids an unbounded
repeat of that large result.

Command checks reconstruct declared argv, preserving filters, scope and
shell-sensitive arguments. Formatting checks cover monetary grouping, separate
currency codes, units, zero, false, empty strings and literal guidance.
Empty, unavailable, partial and failed results have distinct causes and next
actions. Long evidence is accessible without duplicate raw arguments.

Active progress passed 54 appearance switches and 18 cancellation,
context-replacement and shutdown retirements. Animation advances while running,
stops when retired, rejects late updates and causes zero late repaints.
Native capture sessions completed and emitted shutdown; owned child panes were
retired. These synthetic service scenarios qualify installed rendering and
progress behavior separately from real service responses.

Four actual read-only live model turns passed 336 frames and 7,938 terminal
pages. Org and scoped query replies preserve exact executed argv. The independent
cli-operator fault workflow passed 624 frames, 2,292 pages and seven exact model
command comparisons. The index fault workflow passed 624 frames and 2,196 pages
with complete corrective guidance; its skill does not require argv in replies.
Each workflow completed with observed session shutdown and process exit zero.

## Status, dashboard, setup and authentication guidance

Published plain status reported ready on the corporate MacBook at all four
required widths, with exit zero and no overflow. It exposes no expansion,
theme, symbol-preset or progress interaction.

The installed lifecycle passed 17 injected scenarios on each host: readiness,
missing CLI/authentication, expiry, permissions, network/rate limits, invalid
responses, review plans, hint states, principal types and session binding.
These module checks executed no login and probed no Salesforce service.
The published shared UI modules passed 96 frames, 48 zero-effect cancellations
and 48 single synthetic confirmations. Module frames remain distinct from
actual builtin UI evidence.

The actual `/plugin` dashboard passed 24 width/theme/preset combinations and
156 independently inspected details pages. Every capture passed its geometry
check. Narrow wrapping yields 34 detail lines at 40 columns, 22 at 76 and 20 at
wider widths. Identifier, installed/catalog version, description, dependency
order, lifecycle, setup command, all prerequisites and collected-data categories
remain available through the final page. No model turn, setup or login ran.
Normal Ctrl+D exits were zero.

The actual `/plugin setup salesforce` builtin passed 24 combinations and
90 inspected review pages using fixed process-terminal geometry. The isolated
observer constrains terminal dimensions; the published builtin and renderer
remain unchanged. Every review frame was independently checked against its
requested width. Cancel executes zero synthetic logins, fresh Confirm exactly
one, bounded verification reports ready, and a second setup skips execution.
The synthetic CLI realpath is checked and no browser or network login occurs.
All 24 sessions emitted shutdown and exited zero, with no model turns.
An earlier unconstrained setup attempt completed functional checks but suffered
terminal geometry drift; its captures cannot qualify narrow layouts and remain
private. The initial wrapped-text matcher failure is also retained.

Four actual model workflows read the installed authentication guide and handled
initial authentication, missing authentication, missing CLI and expired
authorization. All preserve the canonical `xcsh plugin setup salesforce` route,
with human-owned confirmation and bounded verification. The workflows passed
192 frames and 102 exhaustive terminal pages. Only read tools ran; no login,
setup, credential write or blocked tool call occurred. Session shutdown and
exit zero were observed. This qualifies executed guidance independently of
real browser authentication.

## Default output review

At 120 columns with dark/Unicode appearance, synthetic collapsed/expanded line
counts are org 8/45, describe 38/424, help 13/37, exec 11/31 and pipeline
70/1,223. The monetary query fixture is 186/818 lines because its twelve-row
table uses the shared readable row layout. Expanded lines include complete
technical evidence and arguments; these ratios are not percentages of business
records omitted. The expansion hint alone establishes no default-visibility
defect. Desktop-font raster fidelity is a separate human gate.

## Controller validation and retained failures

Controller source at `822e75f035971f595ca3566702f6633f55f9bc08` passes 18
Python tests and focused Mypy/Ruff/Pylint checks. Tracker/observer checks pass
eight tests and 525 assertions; inventory has 324 surfaces and 2,757 tasks.
Salesforce source passes 354 tests and 2,394 assertions. Plugin, compatibility,
catalog, dependency, hermeticity, privacy and required CI checks passed.

Behavioral regressions cover startup admission, installed provenance, exact
model argv, stable geometry, bounded paging and owned retirement. Original
shell fixture failures, parser assumptions, startup admission failures and
interrupted captures remain private alongside the repaired results.

Closing the actual dashboard reloads extensions through the runtime controller.
That reload removed private observer commands in early attempts; it was not a
setup execution effect. One synthetic dashboard-close attempt produced a model
reply with zero tools; an earlier real dashboard attempt produced two read
calls. Neither is claimed as a clean zero-turn or observer-shutdown run.
Separate final dashboard attempts completed without model turns. Historical
receipts and retirement rows remain unchanged.

## Remaining human gates

- Real authentication: when authentication is actually needed, a human must
  run `xcsh plugin setup salesforce` on the corporate MDM MacBook, inspect the
  review, confirm the intended browser login and observe bounded ready
  verification. Preserve current ready credentials; do not force logout.
- Desktop font: the operator reported the displayed native pipeline fixture
  readable in the normal terminal font: text, tables, currency values and
  symbols. This observation uses runtime 23.9.3 and Salesforce 2.3.15 and is
  scoped to that displayed fixture. Progress motion retains its automated
  evidence; no additional human observation of motion is claimed.

## Delivery and cleanup

PR #1660 merged with all required checks green at
`8acb552b5ddc1ae1560624fb9bdc61ed3de26f68` on 2026-10-20 UTC.
The owned qualification worktree and confirmed merged local branch were
retired. All ignored files were classified as dependencies or test caches and
preserved outside the worktree, along with a recoverable Git bundle.
The font fixture completed, emitted shutdown and its owned pane retired;
the user pane and private evidence remain. Unrelated worktrees and the main
checkout were preserved. Only real authentication remains BLOCKED in the
Salesforce rows. Parent issues remain open until that acceptance has evidence.
