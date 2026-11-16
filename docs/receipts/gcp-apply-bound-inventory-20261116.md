# Original apply-bound initial inventory

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Terraform 2.4.113 seals the fresh initial inventory to the original before-apply
callback, exact compiled arguments, saved plan, executor and owning directory.
The issued reference exposes retained per-resource cloud absences for the
21-resource HA inventory. It grants no execution or creation authority.

Submission still requires a fresh baseline. Later baseline reads verify its
immutable original files and operation lifetime without renewing timestamps.
An original final callback may read it during the separate final reserve;
expired reserves and copied references refuse.

Failing-first tests exposed acceptance of receipt and Platform-body mutations
during later asynchronous reads. The reader now rechecks every retained baseline
after source and lifetime validation. Restoring original bytes cannot revive a
refused inventory.

Verification passed: 660 Terraform tests, 665 Platform/GCloud tests, 14 compiled
bridge tests, 13 shared tests, strict typecheck and all three runtime bundles.
Focused isolated cases verify late initial-receipt, bound-receipt and Platform
mutations, immutable baseline reads after five minutes, operation expiry and
final-reserve expiry. Catalog generation and checks passed before the audit;
final presentation and commit validation remain separately recorded.

Current upstream catalogs confirm Terraform 1.17.2, Google 8.11.0, XC 15.17.3,
xcsh 23.10.13, Bun 1.4.4 and TypeScript 7.0.2. No dependency update is needed.
The qmd dependency retains its separately required TypeScript 5.9.3 peer.

This component uses explicit offline observations and original gated executors.
It does not qualify live initial absence, GCP insertion, guests or ordinary
installed tools. The early identity-to-operation/VM bridge, observer insertion
mapping and built-in capture composition remain open, along with all original
live networking, lifecycle, recovery, traffic, cleanup, installation and delivery
gates. Immutable historical artifacts and unresolved failed-executor evidence
remain preserved.

CI exposed the default five-second Bun test timeout in the process-backed
inventory fixtures. Child-test interruption also raced fixture cleanup.
Terraform 2.4.114 gives each process-backed case a bounded harness allowance and
each isolated parent enough time to collect its child results. Production capture
clocks remain fixed. The failed CI log is retained; fresh changed-input checks
and new-head CI must pass before this component is CI-qualified.
