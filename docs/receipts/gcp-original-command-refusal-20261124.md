# GCP original command refusal and final-reserve source qualification

Issue: #1559. Draft PR: #1698. Engineering acceptance remains incomplete.

The [native executor](../../plugins/terraform/src/signal-free-executor.ts)
retains versioned immutable refusal records for loader, deadline, cancellation
and input checks before spawning. Compiled command guards record their earlier
refusals and forward their actual native child's records. Post-execution input
failures remain execution failures and cannot be attributed as unspawned work.
All seven access adapters preserve the actual executor in their source recorder.

The [source validator](../../plugins/terraform/src/original-reader-group-closure.ts)
joins original request, arguments, executable hashes, ownership and clock bounds.
After-phase refusals retain the exact source-issued five-minute final reserve and
independently verify original parent-group absence. Shifted reserves, foreign
parents, wrong layers and timestamps before the original final window refuse.
Legacy version 1 records retain their original bounds and cannot adopt a new
final reserve. These records establish refusal and closure facts; they authorize
no execution, guest acceptance or clock renewal. Failed captures and locks stay
failed, and immutable v12.3.1 assets remain unchanged.

Failing-first source checks exposed missing precondition records, missing wrapper
handoff, a physical-parent field mismatch, a missed final lower bound and legacy
reserve adoption. Original logs remain private. An unchanged probe caused by a
guarded test edit that failed before writing is explicitly classified as such;
it is not failing-first evidence. Early no-spawn raw records removed by fixture
cleanup are unavailable. Fresh cases now retain the original execution directory
and raw parent capture before fixture cleanup.

Ubuntu verification with Bun 1.4.4 passed 102 executor, source and cleanup cases
with 647 assertions across twelve files, plus 38 access-adapter cases with 236
assertions across nine files. Final focused legacy/native integrity checks,
all three strict plugin typechecks, warning-clean configured lint, normal runtime
build, dependency and generated catalog checks passed. Native guard cases include
real operation expiry; HTTP observations and executable fixtures remain offline.
No GCP campaign was submitted.

Complete factory preparation, startup, before/final guest evidence and cleanup
handoff remain required. Original-provider renewal across real expiry, supported
installation, ordinary Ubuntu `bun dev`, native/Terraform lifecycle and networking,
content traffic, recovery, teardown, restoration, CI, review, merge, publication
and published installation remain separate unfinished gates.
