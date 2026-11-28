# Original VM and serial source binding

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Terraform 2.4.126 exposes private serial bytes only through their own original
early CE, final CE or observer VM packet. Each VM records the serial references
issued through its guarded capture method. Copies and independent reader-issued
records cannot borrow that pairing or poison the original packet.

Source reads check original file bindings, cloud scope, numeric VM identity,
ownership and capture freshness before and after reading. Final reads use the
actual final VM and reserved reader. Original serial timestamps, offsets,
source hash and contents hash remain unchanged. Recognized ownership or
expiry failures permanently retire the packet; restoration cannot renew it.

Six source tests pass using actual plan/callback/VM/serial issuers with
explicitly offline HTTP observations. They cover copies, independent records,
final handoff, VM replacement, disk drift and stale capture clocks. Strict
Terraform types, three runtime bundles and 21 compiled bridge checks pass.
The missing source APIs and compiled exports were observed failing first.

Full regressions passed: 737 Terraform tests, 826 combined Platform/GCloud
tests and 142 shared checks. Catalog/tracker, runtime dependencies, agent
permissions and staged privacy passed. Normal commit hooks and exact-head CI
remain separate recorded gates. SSH trust remains unqualified:
these source bindings must be joined with independently collected wire keys
through the installed host-trust parser before built-in guest capture.

Real token refresh, fresh SSH/VPM/container evidence and all original native/
Terraform networking/lifecycle/traffic/recovery/cleanup/restoration gates remain
required, followed by ordinary installed runtime, review, merge, publication and
verified download/user installation. Frozen collectors, historical locks and
immutable v12.3.1 assets are preserved.
