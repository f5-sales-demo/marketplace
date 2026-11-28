# Original VM and serial evidence through final handoff

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Terraform 2.4.121 hands a verified early VM packet to the actual final callback
and a reader issued under that callback's original reserve. Initial operation
and VM bodies retain their original file bindings. Fresh final observations
must preserve numeric identity, creation time, metadata, interfaces, labels,
service accounts, machine type and forwarding capability.

Successful transfer retires the before packet. Copies, ordinary-operation
readers, changed VM identity or ownership, serial drift and expired final
evidence refuse. Failed original packets stay failed after restoration.
Handoff is single-use; same-source reads cannot renew its five-minute window.
No apply, bootstrap, insertion or live qualification is granted.

The independent VM join now checks the reviewed machine type and forwarding
value. Failing-first tests exposed those missing checks. Machine links normalize
only supported scoped relative paths and full Google links. Invalid normalization
and control-character regex lint failures were retained and repaired.

Actual plan, callback, output, baseline and reader issuers drive the fixture;
HTTP/serial replies remain explicitly offline. The original apply can expire
while final VM/serial evidence is captured. Its result stays failed; baseline
timestamps and original budgets stay unchanged. Actual output completion
acknowledges natural group closure through the existing typed controller API.

Verification passed: 708 Terraform tests, 825 combined Platform/GCloud tests,
strict Terraform typecheck, all three runtime bundles and 19 compiled bridge
checks. Shared, catalog/tracker, privacy, normal hooks and exact-head CI remain
separate gates. Real token refresh through the same Google provider, guest
capture and all live acceptance remain unproven.

Observer insertion mapping, built-in factory composition, original native and
Terraform networking/lifecycle/traffic/recovery/cleanup/restoration, ordinary
installed runtime, review/merge/publication/download/user-install gates remain
required. Frozen evidence, historical locks and immutable assets are preserved.
