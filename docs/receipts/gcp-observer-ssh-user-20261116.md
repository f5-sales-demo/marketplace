# Reviewed observer SSH user

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The reviewed observer compiler installs the campaign key through GCP metadata
for the user `ubuntu`. The installed guest session had instead targeted
`observer`, so its SSH proxy did not match that metadata contract.

Terraform 2.4.123 now connects the proxy as `ubuntu`. The CE destination
remains `admin` on its verified SLI interface. Both original host-key pins,
campaign keys, disabled agent use and fixed capture limits remain enforced.
The observer image, metadata, accounts and service-account policy are unchanged.

The actual session constructor failed the new username expectation before the
one-line repair. All 78 guest Python tests and 51 capture-runtime regressions
then passed, together with observer-plan/shared checks, strict Terraform types
and all three runtime bundles. Regenerated installed-source pins include the
new script bytes. HTTP and guest exchanges in these tests are explicitly offline.

Catalog/tracker, privacy, normal hooks and exact-head CI are separate gates.
This source fix does not qualify SSH access or GCP guest behavior. Built-in
capture composition, serial-derived trust, real provider token refresh and all
original live networking/lifecycle/traffic/recovery/cleanup/restoration gates
remain required, followed by installed runtime, review, merge and publication.
Frozen collectors, historical failures and locks, and immutable v12.3.1 assets
are preserved.
