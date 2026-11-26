# GCP disposable single-node teardown acceptance

Fresh installed runtime qualification covers one node, two NICs, external-IP egress, no ingress and
no destination routes. Both campaigns used confirmed corporate funding, exact BYOL image/document
authorization, private deployment storage and the owning engine. No billing association, payment
method or software order was changed.

| Engine | Installed observations | Typed cleanup | Independent absence | Source |
| --- | --- | --- | --- | --- |
| Native | Two consecutive ONLINE registrations, physical NIC joins and healthy matching-node global-health observations | Passed without fallback | Six cloud objects and two XC objects absent | `dbcc0113` |
| Terraform | Two consecutive ONLINE registrations, physical NIC joins and healthy matching-node global-health observations | Passed without fallback | Six cloud objects and two XC objects absent | `1cfd2dbf` |

Terraform creation used an isolated locked state, pinned Terraform/Google/XC providers and the exact
seven-create saved plan. Applied-plan attestation preceded recording the original Platform
identities. A no-change follow-up plan passed. Typed teardown verified the exact seven-delete saved
plan, original cloud/Platform identities, final empty destroy plan and fresh absence.

The earlier Terraform review failure came from requesting the provider-sensitive whole boot-disk
block. The repaired shared runner projects only explicit nonsensitive nested fields and array
counts. The GCP adapter checks exact disk identity, automatic deletion, NIC count and NIC order.
Whole sensitive blocks and sensitive ancestors remain rejected. The preserved live-plan replay and
fresh installed live review also passed.

Validation: 548 lifecycle/runtime tests, 11 presentation tests, TypeScript, Biome, plugin/catalog
validation and PII checks passed. Required CI passed on the executable source head.

This receipt qualifies the narrow disposable single-node teardown profile. Public deployment apply,
HA, routing/return paths, application traffic, explicit upgrades, repair, replacement, failover,
interrupted recovery and recovery within 120 seconds remain separate acceptance gates. Full parity
and immutable marketplace publication remain incomplete.

## Evidence identities

- Native campaign receipt SHA-256: `7d337f22d77700d19fb4eaf73d1c4d4fdc087124cee851049b621f54238bfa6b`.
- Terraform campaign receipt SHA-256: `b34a4505e61fa05867fca125818cd2c5c1c127fc88a3fe29134c8de7140ff1ec`.
- Terraform final empty destroy plan SHA-256: `d28e242571c5c853e9b75ee6f811e23cbc926df9c1f22e3bd821674eec129e7b`.
- [Source/CI PR](https://github.com/f5-sales-demo/marketplace/pull/1566).
- [Lifecycle test CI](https://github.com/f5-sales-demo/marketplace/actions/runs/39172590482).
- [Lint/shell CI](https://github.com/f5-sales-demo/marketplace/actions/runs/39172590645).
