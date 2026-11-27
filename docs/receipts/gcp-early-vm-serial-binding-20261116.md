# Original early GCP VM and serial binding

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Terraform 2.4.117 binds an early insertion response to its actual owning apply
callback, original plan and sealed initial inventory. Independent cloud readers
must prove the exact original context. Operation ID/name, numeric VM identity,
metadata, deployment labels and ordered interfaces are corroborated before
serial capture. The VM and original inputs are checked again around each read.

Copied source/callback/reader/baseline references refuse. Conflicting operations,
named VM replacement, source mutation and ownership changes during serial capture
retire evidence. An unavailable original VM remains pending without adopting
another incarnation. No execution, bootstrap or completed-RPC authority is granted.

The new path reads initial absence through its sealed issuer. After five minutes,
baseline timestamps remain unchanged while current operation/VM observations
must still be fresh. Stale observations permanently retire their packet.

Failing-first tests recorded missing source and compiled APIs. Original plan,
callback, output and authenticated reader issuers provide the integrated fixture;
HTTP and serial replies remain explicit offline observations. The fixture emits
a split response from a real bounded child before RPC completion. Shared body
validation preserves the existing full VM mapping.

Verification passed: 676 Terraform tests, 16 compiled bridge checks, strict
typecheck and all three runtime bundles. Focused cases cover original correlation,
copy/foreign-context rejection, operation conflict, numeric replacement,
ownership change during serial, pending VMs and distinct freshness semantics.
Platform, GCloud, shared bridge suites, strict typechecks, frozen runtime
dependency checks, generated catalog, agent validation and permission checks
also passed. Tracker validation detected changed Terraform fingerprints;
regeneration preserved prior receipts and the fresh tracker check passed.
Staged privacy first identified a pre-existing non-schematic fixture namespace;
an explicit synthetic placeholder passed the affected inventory rejection tests
and enforce scan. Normal hooks identified generated catalog formatting drift;
the repository formatter corrected it. Hook and exact-head CI outcomes remain
separate delivery gates.

This does not qualify live GCP insertion or guests. Observer insertion mapping,
the full VM join's legacy absence path, final-capture handoff, built-in factory
composition, all original native/Terraform live networking and lifecycle acceptance,
traffic/recovery/cleanup/restoration, ordinary installed runtime and publication
remain required. Frozen evidence, historical locks and immutable assets remain
preserved.
