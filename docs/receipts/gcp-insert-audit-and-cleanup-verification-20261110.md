# GCP insert audit reader and cleanup verification

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 418. Full issue acceptance remains incomplete.

The fixed Google Admin Activity reader uses the same admitted ADC snapshot and
original operation guard as the Compute and serial reader. Google's published
Logging discovery schema specifies a read-only POST to `v2/entries:list`.
The reader fixes one project, instance name and bounded UTC window. It records
the exact query before reading, retains every private response page before
decoding, and continues empty pages when a new continuation token is returned.
Replayed tokens, foreign entries, split records, malformed responses and
unsupported envelopes refuse. One command retains its original 60-second limit,
32-page limit and aggregate four-MiB response bound. Interrupted data remains
private partial evidence; transport and persistence errors both survive.

Duplicate credential, principal and VM identity fields now refuse rather than
selecting the last JSON value. VM IDs outside the unsigned 64-bit range also
refuse. The corresponding cases failed first. The focused authentication,
cloud, serial and operation suites pass 37 tests and 218 assertions.

The combined shared suites pass 1,072 tests and 4,882 assertions. All three
native typechecks, runtime builds and dependency checks pass.

The actual default installed cloud-reader factory completed an authenticated
audit query from a fresh source-owned capture context. It returned one complete
page with zero matching entries. Independent Compute reads verified the fresh
probe name absent before and after the query. This proves the bounded audit
read, not an original insert or an absence inferred from empty audit results.
No managed cloud resource was created or changed.

The combined latest-version source fixture failed. The original Google schema
provider exited between process discovery and stderr FIFO inspection. Original
Terraform lifecycle records independently identify that process as the schema
provider, distinct from the later execution provider. Its exact capture failure
and unresolved original locks remain preserved. The sampling race requires a
coherent acquisition fix and fresh qualification before controller integration.
This failed fixture is not accepted as a successful full capture.

Typed local-only recovery deleted the one owned Terraform builtin resource.
A subsequent verification command exited zero but retained an `input-changed`
classification; the precise triggering exception was not retained. Its failed
verification remains preserved. A new read-only recovery mode binds the original
applied destroy checkpoint, immutable manifest and exact empty state. It refuses
all applies and resumes without submitting another command. Four new cases
failed first; all nine cleanup-recovery cases pass with 24 assertions.

The real read-only verifier produced an empty destroy, stable empty state and
two resumes without submission. Independent inspection verified all 24 original,
reader, recovery and verification process groups absent. Original failed capture
and reader locks remain unchanged. The verification receipt digest is
`d2323b2001220b2096482824b5354814685968a1e3bb95bead0aa8a779a2e4c6`;
the independent cleanup receipt digest is
`4099e7474e854b4b648fb8523d48450c829a2e632fe43943367be2df93c6f21d`.

The full installed capture, original managed-action/request/audit/operation and
numeric incarnation joins, same-original-provider credential expiry, complete
native and Terraform guest/network/lifecycle/traffic/recovery/restoration
campaigns, ordinary installed Ubuntu runtime and all remaining delivery gates
remain required. Frozen collectors, historical receipts and failed flags,
immutable v12.3.1 and q12's unknown cause are preserved.
