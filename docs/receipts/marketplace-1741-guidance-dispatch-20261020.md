# Marketplace observer guidance dispatch repair

Campaign [1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
implementation [1741](https://github.com/f5-sales-demo/marketplace/issues/1741),
KVM child [1595](https://github.com/f5-sales-demo/marketplace/issues/1595).
Base: `6b3f2f2b9e809fead5b8bc11875422a5fd147043`.

## Problem and repair

The earlier installed KVM workflow completed its full skill read, but the
observer omitted guidance from its separate capture lane. Core execution start
and extension wrapper admission can reach the observer in either order.
Published 23.9.5 also materializes omitted optional read fields as `sel: null`
and `timeout: null` in execution-start arguments. Its admitted read arguments
contain only `path`. Both differences prevented the original exact join.

The observer now joins start, admission and completion by opaque call ID and
exact tool identity. Only omitted optional read fields represented as null are
normalized for the argument comparison. Nonempty selectors, changed timeouts,
extra arguments, unadmitted calls, duplicate starts, cancelled turns and late
results remain excluded. Reviewed Bash capture uses its recorded admission and
exact arguments; it no longer infers admission from a matching scenario at end.
Execution-start and result journals retain call IDs and original arguments.
The guard's permitted paths, argument forms and one-use rules are unchanged.

## Source verification

An initial failing behavioral regression reproduced start before admission.
Further installed diagnostics exposed null optional read fields. Regressions
cover both dispatch orders, null defaults, rejected argument changes, duplicate
and unadmitted calls, cancellation and capture shutdown. On Mac, Bun 1.4.2
passed all five foundation suites: 45 tests, 724 assertions, zero failures.
Catalog discovery remains 23.8.0 with 22 plugins, 314 surfaces and 2,670 tasks.
Generated catalog checks, changed-source privacy enforcement and repository
hooks passed. No plugin payload, manifest, dependency or release version changes.
The canonical tracker, Salesforce receipts and retirement records are unchanged.

The earlier order-only candidate passed 43 tests and 718 assertions independently
on Ubuntu. That candidate's installed guidance capture still failed; it is not
accepted as final qualification. Final source checks and the corrected installed
workflow on Ubuntu remain pending because the verified SSH route timed out.
Raw failures and diagnostic journals remain private.

A resumed Mac run independently passed the same 45 tests and 724 assertions.
The full marketplace runner was exercised in an isolated copy of this commit,
with frozen dependency repair and retained Git history for the Salesforce
ownership regression. It reached every plugin suite but did not pass overall.
KVM initially lacked PyYAML; its complete fixture suite passed after installing
CI's exact `PyYAML==6.0.3` in an isolated environment. Xorg's accessibility test
assumes a locally available `gsettings`, and Zoom setup tests reach the Ubuntu
platform guard and macOS path-alias differences. Those current Mac failures
remain recorded; they are not waived or presented as a green full-suite result.
The hermetic diagnostic passed: 354 tests, 2,394 assertions, zero failures.
No plugin test depended on a real cloud CLI.

## Installed qualification

A fresh Ubuntu readiness turn on published 23.9.5 and installed KVM 3.2.1
completed exactly two admitted calls: the full installed skill read and one
`kvm_smsv2_readiness` with `{}`. Neither call returned a tool error and no other
tool was selected. Source-line comparison accounts for the reader's numbered
terminal empty line. The controller returned `ok: true`, `setup_required` and
`coreReady: false`; the model correctly distinguished a completed readiness
inspection from accepted deployment. This turn exposed the remaining optional
argument mismatch and its failed guidance capture is retained privately.
A separate read-only diagnostic confirmed the exact null-default mismatch.
No setup, deployment, reconciliation, removal, authentication or network writes
were performed.

With the corrected observer, a fresh Mac guidance-only turn on published 23.9.5
and installed KVM 3.2.1 read the complete installed skill exactly once. Its
reviewed scenario permits only the installed path with omitted options or
`sel: ""`, `timeout: 20`. The actual call used the latter form; there were no
denied calls or other selected tools. Every numbered read line matches source.
The skill SHA-256 is
`2c3e30813ef33235f824eb917b46de830dc740590136d57e18c25b245269a3fd`.
Scenario SHA-256 is
`b166752eadb3a935c6597e667a0241d61691e46500793b1ceca2c15c9645061f`.

The separate guidance command captured the read through the published binary's
real tool component. All 48 full buffers passed individual width, outcome and
selected literal checks at 40/76/120/153 columns, collapsed/expanded, dark/light
and Unicode/ASCII/Nerd. Theme and preset changes reused the actual component.
An initial inspection named a heading absent from the skill; that failed
expectation is retained, and the corrected selected-literal check passed.
All 48 buffers rebuilt exactly from 444 viewport pages, preserving every row
without omissions or duplication.

## Additional guarded Mac observations

Normal installed `xcsh plugin setup kvm` displayed its declared dependencies,
environment names, install command, verification command and exact confirmation
prompt. Entering `cancel` returned the explicit setup-cancelled error without
running the plan. This CLI observation does not qualify a TUI review matrix.
Two private attempts to observe the open TUI review did not reach dispatched
setup and yielded no accepted frames; those failed probes remain private. The
task-owned runtime process was stopped and the existing task pane returned to
its shell. No setup confirmation was sent.

An additional guidance-only scenario permitting omitted read options was denied
when the model supplied `sel: ""` and `timeout: 20`. Its journal records the
failed guard result and the model's accurate refusal conclusion. It adds no
accepted guidance evidence and does not alter the already qualified explicit
option scenario. The failure is preserved; restrictions were not broadened.

## Remaining delivery and acceptance

Final Ubuntu source verification, a fresh corrected guarded readiness workflow,
its separate guidance/result/conclusion matrices, linked green PR merge and
merged-file comparison on both hosts remain required. The SSH route resolving
to the verified Ubuntu workstation became unreachable during qualification.
Next action: restore that existing route, verify identity and repository, transfer
the validated final files, rerun the final suites and bounded installed workflow,
then deliver issue 1741 through its linked PR.

KVM lifecycle/status and setup-review dispatch matrices remain separate current
gates. Full skill execution and deployment/service acceptance still require an
existing accepted environment and separately authorized mutation or physical
steps. Account-dependent gates remain deferred. Campaign 1579 stays open.
