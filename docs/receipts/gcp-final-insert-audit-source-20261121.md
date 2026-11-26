# Original final insertion audit dispatch

Issue: #1559. PR: #1698. Scope: source dispatch and correlation.

The inactive factory now waits for its VM final capture before dispatching
original CE and observer audit joins. Each dispatch requires the actual final
callback, its original cloud reader and the sealed creation baseline.
Existing audit pair validation is shared without changing CE interpretation.

Observer audit uses its actual observer VM/image source and original request
projection. It checks the distinct false-forwarding role, numeric VM, original
operation name/ID, principal, request reason, requested labels and original
absence chronology. Missing, copied, foreign, malformed or ambiguous evidence
refuses. Sparse final audit data does not substitute for original source proof.
A nullable initial insert target is supported only through the existing original
operation/VM reconciliation guards; a known initial numeric target must match.

Failing-first attempts 1373 and 1376 exposed absent final dispatch. Attempt 1379
used an incomplete pending-ID fixture; corrected attempt 1380 then exposed the
unconditional nullable-target comparison. The repair changes that comparison
only when the original target is unknown and preserves all actual operation,
VM and ownership checks.

Attempt 1382 passed 54 cases and 202 assertions across six dependent suites,
including current and legacy CE audits, observer-role boundaries, missing and
foreign evidence, copied callbacks/readers, pending target reconciliation,
sealed inventory, final image handling and retained factory failure paths.
Current strict Terraform types and source lint pass. Independent archive review
verified 1,610 files and 1,326,978 bytes across 20 private archives.

The source fixtures use explicit offline HTTP and completed provider/UI
observations. This establishes source behavior only. The factory remains
inactive and uncommitted; observer UI/RPC correlation, complete positive factory
execution, remaining source renewal/concurrency and full 30-container-per-node
throughput remain open. Existing query/time/byte bounds and all publication
holds remain unchanged.

Supported marketplace installation, ordinary Ubuntu bun dev, original real GCP
guest/bootstrap/lifecycle/network/traffic/recovery/restoration campaigns,
independent cleanup, current CI/review, merge and qualified publication/installed
smoke remain unfinished. Historical failures, locks and immutable v12.3.1 assets
remain preserved.
