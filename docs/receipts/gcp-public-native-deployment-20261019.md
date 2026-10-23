# GCP public native single-node deployment acceptance

Fresh isolated installed candidate bundles passed the public typed native lifecycle on a disposable
single-node site in Montréal. The profile used two isolated SLO/SLI networks, external-IP egress,
`n2-standard-8`, an 80 GiB disk, no ingress and no destination routes. Corporate development/testing
funding was confirmed without a spending ceiling. No billing association, payment method or
software order was changed.

`gcp_marketplace_agreement` reviewed and authorized the exact BYOL documents. `gcp_ce_plan` then
collected prerequisites and saved the overall deployment review; `gcp_ce_apply` used that original
approved hash throughout asynchronous creation. The public status tool separately established
cloud provisioning, ONLINE registration, both physical NIC identities and matching-node global
health. Two consecutive healthy observations passed after initial software/OS convergence.

The public teardown review and exact owning-engine apply completed without fallback. All six cloud
objects and both XC objects were independently absent. A second independent absence run also
passed. Restricted ownership journals and sanitized evidence remain retained for audit.

| Gate | Outcome |
| --- | --- |
| Installed public native review/apply | Passed |
| ONLINE registration and both NIC joins | Passed |
| Two consecutive matching-node healthy observations | Passed |
| Installed typed teardown without fallback | Passed |
| Independent absence of six cloud and two XC objects | Passed |

The executable campaign source was `7d0364cf8eee4f98c79a1e05cf926d2912ea3de3`. Its GCloud 1.7.0 and Platform
6.3.0 candidate runtime files were frozen before launch; later source edits did not replace them.
The API contract was immutable v12.1.3, and the image was
`f5-7626-networks-public/f5xc-ce-crt-20260801-0205-byol`. Required source CI passed before launch.

This qualifies the narrow installed public native profile. Public Terraform deployment, HA,
routing and return-path symmetry, application traffic, explicit upgrades, replacement, repair,
failover, full interrupted recovery and recovery within 120 seconds remain separate gates.
Initial convergence does not qualify explicit upgrades or recovery time. Immutable marketplace
publication and fresh published-plugin acceptance remain incomplete; full parity is unclaimed.

## Evidence identities

- Campaign receipt SHA-256: `9934a7f59bcf6ecb693cfb475bb1c7e847867fb5b15aa81fd608084f908e4b1e`.
- Final independent absence SHA-256: `1afbf7f1f37353307f91bd58bffdc8a49eadf013915cf5fd933e30fbb6c1d527`.
- GCloud installed bundle SHA-256: `b06a40feecb8338053328fc144165e552927fa99ff6efac245c659a32fdaf27e`.
- Platform installed bundle SHA-256: `bb7c6e8bbb824b227f01d5bfcc2848d97b19f75f4b6b19064d790e6753fbcb34`.
- Overall deployment review: `sha256:60c3b2368da5a49dfb2268316a405bc53cf319e0fca5f2ff461579fe120d3ea0`.
- Overall teardown review: `sha256:26a11bb3da50f119d03be03b98c5b7bce34d972ed445435c77031d13ad3c84be`.
- [Source and delivery PR](https://github.com/f5-sales-demo/marketplace/pull/1566).
- [Executable-source plugin CI](https://github.com/f5-sales-demo/marketplace/actions/runs/39177570486).
- [Executable-source lint/shell CI](https://github.com/f5-sales-demo/marketplace/actions/runs/39177570696).
