# GCP operation and VM evidence correlation

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 422. Full issue acceptance remains incomplete.

The original authenticated cloud reader now supplies private evidence only for
records it issued. It rechecks the original file identity, exact bytes, scope,
credential snapshot and lifetime inputs. Copied records, cross-reader use,
same-byte file replacement and credential rotation refuse. Returned byte copies
cannot alter the retained evidence. Failed completed operations retain their
raw response and cannot produce a success candidate.

The source-issued insert candidate can now be correlated with initial scoped
absence, exact operation and numeric VM identity, creation chronology, metadata,
bootstrap hash, ownership labels and ordered network/subnet/IP/egress fields.
The join performs a final VM GET and repeats original input and evidence checks.
It refuses replacement, mismatched bootstrap, foreign interfaces and attached
service accounts. The existing cloud and serial guards now also bracket labels
and service accounts; a stable numeric ID cannot hide changed ownership.
These joins have source-test evidence and retain false apply/original-insert
qualification flags. Independent audit attribution, Platform token ownership,
original source lifetime, guest and traffic evidence remain required.

The first fresh read capture failed when the original Terraform parent entered
its natural exit transition during the second window. The old reader treated
that transition as unavailable or stopped. Its original failure and locks remain
preserved. A failing-first real-process regression reproduced the transition.
The fix corroborates the original kernel start/group/boot and independent SDK
exit identity, then requires original group absence within a bounded observation
and the existing window deadline. Stopped, replaced and still-live groups refuse.
An unavailable live group cannot produce a completed empty capture.

Typed cleanup deleted exactly the one owned local Terraform builtin. The final
empty plan replaces the applied checkpoint, so a new explicit read-only cleanup
resume verifies the original owner, configuration, locks, stable empty state and
recorded empty-plan bytes. It never prepares mutable runner state or submits an
executor command. Two actual read-only resumes submitted zero commands.
Independent verification confirmed all 23 original, reader and recovery groups
absent, stable empty state and unchanged failed capture evidence. Its digest is
`0b587f4ef32b5334a4e236d3641fdcf5a1c9ff31b6078fd10e45100b423770a6`.

The fresh changed-input read qualification passed. It used Terraform 1.17.1,
Google 8.10.0, xcsh 15.15.6 and Bun 1.4.4 through the actual standard runner and
default compiled readers. Both original provider/FIFO windows completed, with
9,709 records, matching private body/evidence hashes and refusal of copied
cloud evidence. No-change planning, typed teardown, empty destroy, stable empty
state, two non-submitting resumes and 28 independent group absences passed.
No managed cloud resource was created or changed. Source receipt digest:
`3f31a7d4bf8b2d3046d26bd8b6895a013d8e8050a03c70ddc076f9e678450e00`.
Independent cleanup digest:
`d04180e68e1271d9829472c48eeec6a587286a89fc912e2974841de7e01ebcac`.

The shared suites pass 1,103 tests and 5,047 assertions. All 41 Python provider
process/FIFO regressions pass; eleven cleanup recovery tests pass. Native
typechecks, runtime builds, dependency checks and changed-source privacy pass.
The previous exact delivery head passed all applicable CI before this change.

This proves source correlation and real read-evidence capture, not a managed
insert or complete installed capture. Audit/Platform bootstrap/lifetime joins,
observer mappings, same-original-provider refresh across expiry, full native and
Terraform single/HA guest/network/lifecycle/traffic/recovery/restoration campaigns,
ordinary installed Ubuntu runtime, review/CI/merge, publication/downloads and
published installation remain open. Root disk repair, safe global Terraform
upgrade and attempt 418's unknown cause remain tracked. Frozen collectors,
historical failed locks, q12's unknown cause and immutable v12.3.1 remain intact.
