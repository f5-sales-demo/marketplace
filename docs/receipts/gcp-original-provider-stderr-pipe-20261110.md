# Original Google provider stderr pipe corroboration

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 413.

The original process monitor now issues an immutable stderr FIFO witness only
for a candidate it admitted. Kernel file type, device and inode, descriptor
information and access flags bind the exact provider's descriptor 2 to one
read-only descriptor of its original Terraform parent. Original kernel and
psutil process identities, executable pins and input guards are rechecked
around capture. The witness retains the original provider and parent descriptor
identity for later reinspection. No stream bytes are consumed by this inspection.

Missing or duplicate parent readers, provider redirection, changed inputs,
replacement, cloned witnesses and cross-kind capabilities refuse. Failures
retire the monitor and retain attributed private receipts. Six new failing-first
real-process cases and fifteen existing process/reader cases pass through
cooperative EOF closure. The focused Bun wrapper passes sixteen tests and
59 assertions. The shared suites pass 1,036 tests and 4,672 assertions; all three
native typechecks, runtime builds and dependency checks pass. Ruff, formatting,
Mypy and Pylint pass, with Pylint scoring 10.00. Initial lint findings remain
retained and were fixed without disabling checks. Existing candidate schemas
and historical receipts are preserved; the modified source digest is repinned.

A fresh authenticated Terraform 1.16.6 / Google 8.7 standard-runner fixture
started a bounded independent observer before releasing the original apply
gate. Kernel captures retained both schema and execution providers with distinct
FIFO identities. The exact read provider joined the original lifecycle and HTTP
candidate by PID, parent, group, boot identity, executable digest, plan hash,
request ID and received/served record hashes. All 9,592 trace records were
retained. No-change planning, typed teardown, empty destroy, stable empty state
and two non-submitting resumes passed. Independent kernel and psutil inspection
verified all 27 executor and observer groups absent. The source receipt is
`81e763e11a0163fed6b1b2689b672bfa48f14d8f2a80697fd264363950235993`.
The independent cleanup receipt is
`2c6f05a429254ebd89bc908fc77a79d04829d55188d6bc9397c77b8668d32380`.

The first fixture failed during provider download because the host's default
temporary filesystem was full. It created no state or cloud resources, and
both original groups were independently absent. The replacement explicitly
selected the existing task temporary directory on a larger filesystem before
compiling its environment. The failed receipt remains preserved. Host root
disk pressure remains an operational repair requirement.

This qualifies the source process/FIFO/read composition. The reviewed scope
allowed one local builtin create and one Google zones read, with zero managed
cloud resources or mutations. Synthetic CE and unused Platform fields were not
applied. Process, apply RPC and original insert authorization flags remain false.
The compiled installed reader/controller still needs to consume this witness
with the original reviewed managed action, request, audit, operation and numeric
incarnation joins. Ordinary GCP apply still refuses before plan consumption.
Full guest capture, all native and Terraform lifecycle, networking, traffic,
recovery, same-original-provider expiry refresh and cleanup/restoration gates,
ordinary installed Ubuntu runtime, review/CI/merge, qualified publication,
downloads and published installation remain open.
