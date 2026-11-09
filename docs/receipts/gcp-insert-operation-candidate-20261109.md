# GCP insert operation identity boundary

The source-owned Compute reader now supports the documented zonal operation
GET by name or exact numeric identifier. An insert candidate retains its
operation ID, target VM name and exact `uint64` target ID when available.
Pending operations may lack the target ID; subsequent reads may fill that
same operation's identity. Replaced operation/target identities, foreign scope,
wrong operation kind, malformed output and URL injection refuse. Exact raw
responses remain private. Candidates never grant apply or insert authority.

Five new cases failed before their implementation and now pass. Shared source
validation passes 973 top-level tests and 4,280 assertions, Terraform typechecking,
runtime builds, lint and privacy checks. A fresh default native Compute operation
GET using the admitted authenticated snapshot returned an attributed absence for
a new probe name, with zero cloud resources or submissions. That verifies the
read mapping and authentication; a live inserted operation remains unqualified.

Research used the pinned Google provider 8.7.0, its SDK 2.40.1 and protocol
server 0.31.0 source plus current official Compute and audit schemas. The
legacy HTTP transport emits unpaired standard-log request/response dumps
without RPC context or transaction identifiers. Protocol data files use
millisecond filenames and overwrite writes, so concurrent samples cannot prove
an original request. The optional reviewed `request_reason` provider setting
supplies an audit-correlation header; correlation alone does not grant authority.
The original ApplyResourceChange, audit request and target incarnation still
need a verified join before the full installed consumer can be enabled.

Preserve the [full acceptance matrix](gcp-issue-1559-acceptance.md). Default full
capture, cloud apply/insert attribution, GCP guest/traffic/lifecycle acceptance,
ordinary installed runtime and all review/publication/install gates remain open.
