# GCP original apply workspace and final authorization repair

Issue: #1559. Delivery: draft PR #1698.

Tracing the default guest-worker integration exposed two controller gaps. An
apply admission could name a different execution workspace, and a failed final
reserve check could still invoke the worker. The controller now requires its
original execution directory, passes an immutable admitted snapshot and requires
a valid original reserve before final guest work. A journal-write failure still
permits valid capture; authorization and retention failures remain separately
retained.

Four failing-first regressions reproduced the gaps. The existing journal-failure
capture regression still passes. A failed fixture journal assertion is retained;
the corrected fixture records the controller's own events.

Fresh official registry reads on November 10, 2026 confirm Terraform 1.17.1,
Google provider 8.11.0 and xcsh provider 15.15.7 remain the latest stable releases.
Their existing authenticated executable profiles remain selected. Historical
locks and stored deployments keep their original versions and engine.

All 1,352 shared/canonical tests pass with 10,897 assertions. Three native
builds and typechecks, dependency, catalog, manifest, source lint and privacy
checks pass. The tracker retains 2,678 tasks across 315 surfaces and 22 plugins.

The default guest worker remains absent and apply remains held. This repair
does not qualify actual provider expiry, managed insertion, guest capture,
single-use bootstrap, networking, lifecycle, installed runtime or publication.
No cloud resources were created. Historical failures, locks, frozen collectors
and immutable v12.3.1 assets remain preserved.
