# GCP capture retirement and Platform presence evidence

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The cloud reader and Platform observation now retire through an idempotent
abort-and-settle closure. Closure rejects subsequent reads and prevents pending
operations from returning success after retirement. Available partial response
bytes remain private, with incomplete capture evidence retained.

Platform observation exposes issuer-owned presence packets for scoped Site and
Token GET responses, including retained HTTP 404 bodies. Successful responses
must identify the requested name and namespace. Copied packets and retired
issuer references refuse verification. Presence does not prove creation ownership
or authorize bootstrap execution.

The stream fixtures disable prefetch and wait for the consumer's second read
before closing. They verify exact retained partial bytes. The compiled Platform
boundary verifies attributed absence and invalidation of body authority on close.

Upstream endpoints checked on November 15 confirm Terraform 1.17.2, Google
provider 8.11.0, XC provider 15.17.3, Bun 1.4.4 and xcsh 23.10.13 as current.
The candidate uses this tuple. Frozen collectors, historical evidence and
immutable v12.3.1 assets remain preserved.

Focused tests pass 65 cases across three files. Compiled runtime checks pass
12 cases. Terraform and Platform strict typechecks pass. The first broader run
used an incorrect validation environment variable and fell back to ambient
Python without the fixture dependencies; its failure log remains retained.
The corrected run uses the existing qualified interpreter via `CE_TEST_PYTHON`
and passes 548 Terraform cases, 286 Platform cases and 13 shared cases. Three
versioned bundles, catalog consistency and presentation inventory validation pass.

These checks qualify source behavior and the compiled API boundary. Full built-in
inventory/bootstrap/insertion/guest capture, ordinary installed execution, all
original native and Terraform live networking and lifecycle acceptance,
independent cleanup/restoration, required review and CI, merge, publication and
user installation remain required. No cloud campaign was submitted by this change.
