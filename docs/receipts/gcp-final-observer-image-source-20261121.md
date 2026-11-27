# Original final observer image source mapping

Issue: #1559. PR: #1698. Scope: original source composition.

The installed image producer now binds its credential snapshot, owning context
and actual before or final callback. The factory selects separate source readers
for preparation, original observer insertion and reserved final capture.
The final observer reference binds one eligible final reader; copied callbacks,
copied readers, before readers and competing bindings cannot replace it.

A fresh final reader preserves the original image numeric ID, namespace,
creation timestamp and authentication snapshot. It supports original observer
VM/disk recapture after operation expiry within the unchanged final reserve.
Source-issued before expiry remains refused on before reads and is retained
in the schema-2 final view. Image ownership/input failures remain permanent;
restoring original bytes or supplying a fresh reader cannot clear them.
Historical single-reader views and immutable receipts retain their source
interpretation.

Attempt 1350 reproduced the factory before-deadline guard failure through a
genuine original final callback. Attempt 1351 exposed an incomplete synthetic
RPC tail when its actor exited at the deadline; the fixture now writes the whole
original trace before exit and asserts final verification independently.
Attempt 1356 retained a shared-fixture extra-argument failure; the accidental
argument was removed without changing any production refusal.

The corrected attempt 1358 passed 52 cases and 226 assertions across six suites:
current final image/VM handoff, copied and competing source admission, before
expiry, pinned image replacement, permanent ownership refusal, historical
observer/source behavior and retained factory failure paths. Current strict
Terraform types and source lint pass. Independent review verified 586 files,
500,858 bytes and eight private archives against immutable hashes.

All HTTP responses in these fixtures are explicitly offline observations.
The source mapping does not qualify real GCP SSH, bootstrap journal coverage,
operational health, traffic or deployment behavior. The factory remains inactive
and uncommitted, with positive full before/final execution, observer/audit joins,
shared-source concurrency and full 30-container-per-node throughput still open.
Original runtime installation, ordinary Ubuntu bun dev, all live lifecycle and
networking/recovery/restoration campaigns, independent cleanup, current CI/review,
merge and qualified publication/installed smoke remain unfinished. Historical
failures, executor locks and immutable v12.3.1 assets remain preserved.
