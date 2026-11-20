# Original early GCP insertion responses

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Original output now exposes a verified consumed-prefix snapshot while its
producer remains alive. Reading the snapshot preserves stream offsets and the
original deadline. Issued snapshots revalidate the original handles, directory,
producer, input identity and consumed-byte hashes. Copies and caller-created
interfaces cannot supply this evidence.

The HTTP parser exposes original response observations before the RPC finishes.
Each observation retains the request/response hashes and original producer
reference. Later source changes, mixed bytes, replay and missing RPC completion
retire it. Final RPC, VM/NIC/token/audit ownership and reviewed-plan authorization
remain separate requirements.

The early identity consumer reuses the insertion-body mapping and joins the
response to the actual owning plan, current artifact tuple and executor
directory. It selects one declared VM create by project, zone and name, and
retains the original numeric target when available. References revalidate their
sources; copied identities refuse. These identities authorize no execution.

Failing-first tests pass with real gated output issuers and explicitly simulated
Google traces. Twelve focused cases cover unfinished RPC/process capture,
non-consuming prefix verification, copy/replay/channel rejection, permanent
retirement after byte restoration and distinct plans with identical bytes.
Terraform 2.4.112 passes 656 Terraform cases, 665 Platform/GCloud cases,
18 compiled checks and 13 shared cases. Typecheck, three bundles and catalog/
presentation fingerprint validation pass.

A real Google provider image read exercised the original live output pump and
prefix verification. The first probe completed after the actor had exited, so
it did not establish live-parent capture. After independent cleanup, a changed
reviewed local-only plan held Terraform open for capture with a bounded
provisioner. The original parent was verified alive at response capture; final
RPC, UI output and no-change planning passed. Both local resources were removed,
all 26 command groups were independently absent, state/destroy were empty and
zero cloud resources or locks remained. Two resumes submitted no commands.

These component probes do not qualify GCP insertion or guest behavior. Full built-in
inventory/bootstrap/insertion/provider/serial/SSH/guest composition, all original
live networking/lifecycle/traffic/recovery/cleanup/restoration, remaining
installed checks and review/CI/merge/publication remain open.
