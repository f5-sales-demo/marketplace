# Original GCP insertion source witnesses

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The HTTP/RPC parser consumes original executor-issued stderr records and binds
contiguous offsets, completed channel hashes and executor identity. Its source
accessor rechecks both retained output channels. Plain logs, copied records,
wrong channels, replay, mixed sources and copied completion references refuse.
The strict RFC3339 validator also rejects impossible calendar timestamps.

A further failing-first check exposed a distinct owning plan with identical
bytes being accepted from a different workspace. The executor now binds its
actual workspace directory and filesystem identity into original output sources.
HTTP, UI and lifecycle witnesses must match that owning plan directory. The
regression now refuses the second original lease; prior failed evidence remains.

The insertion witness consumer joins the owning plan projection, original UI
hooks, HTTP bodies, provider lifecycle records and independent provider window
time correspondence. It rechecks each producer capability and permanently
refuses changed or retired sources. UI timing must contain the insertion RPC.
Source correspondence leaves insertion and execution qualification flags false;
numeric VM, NIC, token, principal and audit ownership remain separate gates.

Failing-first source and compiled checks are retained. Terraform 2.4.110 passes
642 Terraform cases, 665 Platform/GCloud cases, 15 shared compiled boundary cases
and 13 catalog/tracker regressions. The Terraform typecheck, three runtime
bundles, catalog generation and presentation fingerprint regeneration pass.
The new compiled consumer tests are included in the Terraform total.

Published catalogs confirm Terraform 1.17.2, Google 8.11.0, XC 15.17.3,
Bun 1.4.4, xcsh 23.10.13 and TypeScript 7.0.2 remain current.
A fresh authenticated read confirms the frozen observer image numeric identity.
The source fixtures simulate UI, HTTP and provider observations; they do not
qualify live GCP insertion, guest access or deployment health.

The initial real Terraform provider probe read that same image during a deferred
apply-time data source call. Original HTTP, RPC lifecycle and UI output passed
their source checks. A reviewed local-only gate was removed; independent kernel
and SDK checks confirmed all 26 command groups absent, empty state/destroy and
zero executor locks. Zero cloud resources were created. This qualifies the
provider read and output boundary, without qualifying cloud insertion or guests.

The fresh workspace-binding probe exited Terraform successfully but failed
original output capture during independent process-group closure inspection.
Its generic error did not retain the underlying cause. Capture remains rejected;
all 26 command groups were independently absent after local-only cleanup, with
empty state/destroy and no executor locks or cloud resources. Preserve that
failure and qualify cause retention before another changed-input probe.

Full built-in insertion/provider/serial/guest composition, original live
networking and lifecycle acceptance, remaining installed checks, independent
cleanup/restoration and review/CI/merge/publication remain required.
