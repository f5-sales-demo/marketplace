# GCP insert body evidence and source correlation

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 421. Full issue acceptance remains incomplete.

The authenticated Google 8.10.0 binary records revision
`abd6d1130c758fed9ee011f11c0c2274b9279e96`, matching the official release tag.
Its recorded modified-source flag remains retained. Published create/transport
source and the current Compute discovery schema were inspected before mapping:
instance creation sends a zonal POST with `alt=json`, returns an asynchronous
Operation and records a named Terraform resource identity. Compute documents
`targetId` as the specific numeric resource incarnation. Source metadata and
documentation do not replace live managed-insert qualification.

The HTTP/RPC parser now supplies private bodies through a single-use capability
of the emitting parser. Copied candidates and cross-parser use refuse. Later
stream failure revokes released evidence. Legacy candidate results remain
immutable and hash-only; authorization headers are not returned in body evidence.
Named-instance selection handles same-zone HA requests while preserving refusal
of repeated matching requests. Caller mutation cannot change the admitted name.

The new latest-profile CE insert projection preserves exact uint64 operation and
target identities, request/response hashes, metadata/label/interface/disk hashes
and a bootstrap hash without exporting bootstrap bytes. Wrong engines, missing
ownership fields, duplicate metadata, attached service accounts, foreign or
failed operations and malformed resource paths refuse. An absent pending target
remains incomplete. The source join binds reviewed configuration and create
action, completed resource identity, exact RPC records and original provider/FIFO
window fields. Its provider, apply and original-insert qualification flags remain
false. The owning controller still needs independent audit, operation, numeric
VM, bootstrap ownership and lifetime evidence before granting any authority.

Pre-existing VM and operation timestamp validation accepted coercible dates and
invalid calendar days. Failing-first cases reproduced this. RFC3339 validation
now preserves original offsets and fractional precision and refuses malformed
dates after raw response retention. A separate delivered CI repair adds a missing
Python fixture annotation; source and fixture Mypy checks pass. The repaired head
passed all 27 checks before this new source delivery.

Focused body/source/cloud/operation suites pass 60 tests and 337 assertions.
The shared suites pass 1,093 tests and 5,008 assertions. All three native
typechecks, runtime builds, dependency checks and changed-source privacy checks
pass. Original historical profiles, failed flags, collectors and v12.3.1 assets
remain unchanged.

A fresh standard-runner read fixture uses Terraform 1.17.1, Google 8.10.0,
xcsh 15.15.6 and Bun 1.4.4. The real compiled reader retained the same original
provider/FIFO across two windows and 9,709 trace records. Original private body
hashes match the emitted read candidate and repeated consumption refuses. The
default authenticated audit reader and independent probe absences passed.
Only a local Terraform builtin was created; no managed cloud resource changed.
No-change planning, typed teardown, empty destroy, stable empty state and two
resumes without submission passed. Independent verification confirms all 28
original groups absent and no new unresolved campaign locks.

The source receipt digest is
`1c0b8af2f71eae632785abcebd595dc458829fb7119be8185aefa735505cb517`;
the independent cleanup digest is
`485b9ec66792a9186e70dbeda7b358698a9a0e4aa063526a41914d37eee41e2b`.
This qualifies real read-body capture and cleanup. The managed insert projection
and source join have source-test evidence only. They do not establish a managed
insert or complete installed capture. Full audit/operation/VM/bootstrap joins,
observer and other required mappings, same-provider refresh across expiry,
native/Terraform lifecycle and networking campaigns, complete guest and traffic
evidence, ordinary installed Ubuntu runtime, review/CI/merge, publication and
published installation remain required. Root disk pressure and safe global
Terraform upgrade also remain open.
