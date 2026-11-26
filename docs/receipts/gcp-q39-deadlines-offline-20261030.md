# GCP q39 execution deadlines

Issue: #1559. Attempt: 309. Full issue acceptance remains incomplete.

The shared deadline component binds an original monotonic start to a
fifteen-second startup window, a two-hour apply window, sixty seconds for other
admitted commands and a separate five-minute final capture reserve. Completion
cannot reset these deadlines. Invalid clocks, changed budgets and unknown
commands or phases are refused. Command admission remains a separate check.

Three failing-first deadline tests passed. The shared Terraform regression
suite passed 57 tests with 380 assertions. A versioned private transport then
ran a harmless credential-free Python child for 61 seconds under the original
apply budget. The full check completed in approximately 63 seconds and passed
11 assertions. It retained natural completion and original process identities;
fresh independent SDK and kernel observations verified absence of all three
recorded gate, controller and reviewer subjects. No Terraform provider or cloud
operation ran in this deadline fixture.

The initial missing interpreter binding refused execution before child launch.
Read-only diagnostics identified the missing binding; the changed execution
used the existing verified interpreter and observer hashes. Frozen local
controllers and prior evidence remain unchanged. Source and private transport
typechecks and source formatting passed. Controller and reviewer CLI E/F checks
passed; the copied gate retains its predecessor's lambda-style lint finding.
That finding remains recorded for a future production successor.

Supported tracker reconciliation refreshed 59 input fingerprints. All 2,678
task IDs, scopes, evidence, receipts, delivery links and retirements were
preserved. Ten tracker checks passed with 498 assertions.

This qualifies the deadline contract and a local execution beyond sixty
seconds. It does not qualify a two-hour cloud apply, final capture on production
failure, refreshable credentials, or a production cloud consumer. Those gates,
the Platform bridge and campaign guard, installed runtime, live guest and
lifecycle behavior, networking, content-verified traffic, recovery, cleanup,
review and publication remain open. Reported checks at the predecessor passed
or were skipped; PR #1698 remains draft. Historical capture and reader closure
flags remain false, and immutable published artifacts remain preserved.
