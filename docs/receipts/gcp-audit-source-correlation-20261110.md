# GCP audit source correlation

Issue 1559 remains incomplete. Audit batches now retain their original query-file
identity and publish reader-issued page records. Private evidence access rejects
copied batches, cross-reader records, query replacement, changed page bytes and
credential rotation. A query replaced during pagination can no longer produce a
completed batch.

The new unqualified insert candidate joins original source, cloud operation and
numeric VM evidence to one audit first/last pair. The demonstrated Compute mapping
uses the operation name in the audit operation ID. The candidate checks principal,
request reason, numeric incarnation, scoped response links and requested ownership
labels. Omitted bootstrap metadata and sparse final records do not substitute for
the separate bootstrap and cloud evidence. Missing first-record request reason is
an explicit refusal. Apply and original-insert qualification flags remain false.

Failing-first tests exposed the missing accessor/module, accepted query replacement
during pagination, conflicting response links and incomplete missing-reason errors.
The focused suite passes 50 tests and 255 assertions; shared suites pass 1,115 tests
and 5,095 assertions. The serialized root and canonical suite passes 164 tests
and 5,471 assertions. Its earlier concurrent run timed out in one Xorg fixture;
the original five-second timeout remains unchanged. All three native typechecks, runtime builds and dependency
checks pass. Tests use the current Terraform1.17.1/Google8.10.0/xcsh15.15.7 profile;
historical profiles and assets remain unchanged.

A fresh scoped source-read campaign retained the new query/page evidence checks,
then failed in the independent SDK reader during prospective process identity
inspection. Its original error reports an unavailable or stopped actor; the exact
state at the failed identity read was not retained. Subsequent inspection joins
the retained prospective PID and earlier running snapshots to Terraform's initial
provider startup and exit, followed by a distinct provider for the actual read. The overall capture remains unaccepted and no
unchanged retry was submitted. Typed local recovery, empty destroy, stable empty
state and two read-only resumes without submission passed. Independent verification
found all 22 original and recovery process groups absent. Failed source and reader
locks remain preserved. No managed cloud resource changed.

| Private evidence | SHA-256 |
| --- | --- |
| Original failed campaign | `10b76d2b0e8ab093917744b1a51dd4770706f04a3504285a73005f34ae9849c2` |
| Typed recovery | `05c18c7d146e198ff0c94b4206c065c36c1514760aa6e5924b3a210a42c72b2c` |
| Non-submitting resumes | `9668707e7da3cf00966aeb73151d22f38cd5c181eaf92066b0d1973c07282443` |
| Independent cleanup | `d1c368587525e5feb0fd1f2626d110bdd9e89cc40dd8e780cf642b1309e29b4d` |

Next work must retain the prospective identity failure precisely and qualify a
changed collector, then complete Platform bootstrap ownership and original source
lifetime. Positive current reason-bound audit evidence and the full default
installed capture factory remain required. Credential expiry, all native/Terraform
CE guest, network, lifecycle, traffic, restoration, ordinary installed Ubuntu
runtime, review, publication and installed release acceptance remain open.
