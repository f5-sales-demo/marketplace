# GCP CE wire and serial source checks

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery remains draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The CE scan derives the exact SLI address and numeric VM from original reviewed
evidence. Only the same qualified observer, client ABI and actual callback can
select the fixed command. Its native consumer verifies the original gated
process, sealed executable, output descriptors, completion and deadlines.

The scan selects RSA public keys of at least 3072 bits. Subsequent login is
restricted to RSA SHA-2 signatures. Observer keys remain Ed25519. This addresses
q31's recorded algorithm mismatch; its original cause remains unknown.

CE serial reads use the target's private original VM reader. The shared
host-trust parser has distinct CE and observer reference families. Parsed
packets grant no provenance or guest access. Original clocks, freshness,
retirement, failure evidence and unresolved locks remain enforced.

Two additional defects were found and reproduced first. Guest ABI freshness
now begins at capture start. Linux process enumeration handles ESRCH when a
process disappears during a read; permission errors, live groups and unresolved
capture still refuse closure. A missing SSH setup checker now reports its own
prerequisite instead of suggesting that Terraform is missing.

The shared Platform, GCloud and root suites pass 1,015 cases. Eight process-lock
regressions pass, and the previously failing final-callback case passes.
Three actual loopback guest cases and eleven subtests pass; three isolated
compiled boundary cases pass. Types, source formatting and Python checks pass.
The first full Terraform run passed 812 cases and failed final-callback closure
on ESRCH. Its failure is retained. Full confirmation after repair passes all 813 cases and 4,282 assertions.

These are source, process and compiled checks. No original positive GCP guest
SSH or ABI, CE authentication, ordinary installed runtime or live operational
acceptance is claimed. The default installed capture factory, read-only proof
renewal, complete VPM/bootstrap/container capture and every remaining issue
1559 live, cleanup, review, CI, publication and installation gate remain open.
Historical evidence and immutable v12.3.1 assets are preserved.

Current-head CI initially failed on stale presentation input fingerprints.
Regeneration preserves all 2,686 task IDs, historical evidence, receipts,
delivery links and retirement records. It updates 505 input fingerprints
and reopens their acceptance; ten tracker regressions pass. Fresh CI
remains required. No installed or live gate is inferred.
