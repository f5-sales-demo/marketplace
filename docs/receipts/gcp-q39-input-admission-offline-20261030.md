# GCP q39 input admission

Issue: #1559. Attempt: 305. Full issue acceptance remains incomplete.

A versioned private admission component checks the frozen q39 configuration,
the reviewed provider lock and all 21 configured resource addresses. Additional
Terraform inputs, alternate engines, changed or aliased files and malformed
evidence are refused. It exposes no executor and always reports cloud execution
disabled.

Credential admission binds the exact environment to a separately reviewed
private snapshot. The snapshot must retain verified account, project and read
closure, be less than five minutes old and have sufficient lifetime in both
contexts for the operation plus a separate five-minute final capture. Changed
credentials and ambient overrides invalidate admission. Caller-provided hashes
are not authentication or independent review of arbitrary caller data.

Create-plan checks bind saved bytes to the reviewed receipt, configuration,
lock, deployment, backend, engine and exact 21 create identities. Duplicate or
missing identities, replacement, teardown, no-change and already-consumed
receipts cannot enter this create-only component. Existing cleanup paths and
historical receipts remain unchanged.

Offline tests use synthetic credential and saved-plan bytes. Their results
qualify refusal and binding behavior; they do not qualify live credentials,
actual Terraform plan contents or a cloud submission. The component still
requires trusted live snapshot production, Platform workspace ownership,
provider package joins, independent absence and plan review, the production
deadline and execution bridge, and the campaign guard before live use.

Guest, lifecycle, networking, content-verified traffic, recovery, cleanup,
installed runtime, review and publication gates remain open. Historical capture
and complete reader-closure flags remain false. Original locks, frozen
collectors and immutable published artifacts are preserved.
