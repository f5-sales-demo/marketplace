# GCP installed runtime source closure and reader retention

Issue: #1559. Draft PR: #1698. Engineering acceptance remains incomplete.

The [installed runtime](../../plugins/terraform/src/installed-runtime.ts) now
verifies original parent-group absence before closing
nested capture sources. A failed capture no longer prevents that inspection.
Original claim and lifetime bindings are checked before and after closure;
active, live or replaced parents refuse. Capture failures and unresolved flags
remain failures, and credentials retire only after successful source closure.
Closing the runtime also prevents new acquisition, execution and apply admission.

The apply controller preserves the actual optional reader-input accessor. The
[retention helper](../../plugins/terraform/src/installed-reader-input-retention.ts)
retains original inputs in shared immutable Platform storage, even
when capture acceptance fails. Repeated or concurrent retention creates one
record and rechecks original file identities. Replaced sources or saved records,
changed input sets and ownership changes during persistence refuse. A custom
capture without that accessor produces no fabricated reader evidence.

Failing-first tests exposed missing retention and an ownership change accepted
after an immutable write. Both failures are retained privately. The corrected
source checks scope around persistence and preserves the original input bindings.

Validation passed on Ubuntu with Bun 1.4.4: 49 focused cases with 275 assertions
across five files, followed by 68 closure, cleanup, lifetime and generated-runtime
cases with 294 assertions across eleven files. All three full strict plugin
typechecks, warning-clean configured Biome checks, the normal three-plugin
runtime build, dependency checks and generated catalog verification passed.
The native fixtures retain their process and source evidence privately and
perform no GCP submission.

The complete capture factory remains inactive. Early startup provenance, complete
factory execution and cleanup handoff, actual provider renewal across expiry,
supported installation and ordinary Ubuntu `bun dev`, live lifecycle, networking,
content traffic, recovery, teardown and restoration remain required. CI, review,
merge, publication and published installation remain separate unfinished gates.
Immutable v12.3.1 assets and historical failed captures remain preserved.
