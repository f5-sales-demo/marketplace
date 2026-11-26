# GCP bootstrap, VM and audit join

Issue: #1559. Full acceptance remains incomplete.

The Terraform source now joins original Site/Token bootstrap evidence to the
existing independent VM and insert audit producers. The join requires the exact
original capture context, creation plan, parent process, project, zone, node and
owned labels. It verifies that the captured VM request contains only the original
Site-bound JWT in certified token-only cloud-init. Extra commands and different
tokens refuse. Private JWT and user-data remain absent from candidate summaries.

The existing producers retain initial absence, exact insert operation, numeric
VM identity, metadata, ordered NICs, audit first/last records, principal and
request-reason checks. The combined join requires two CE interfaces and the
original admitted ADC principal, audience and snapshot. Copied contexts or
evidence and different creation plans cannot substitute for their issuers.

Context checks use the existing private source registries. Original parent
identity is carried from the issuing creation result. Shared simulated producers
were moved to a fixture-only module; no test runner or production transport was
replaced. Focused tests cover original bindings, tokens, scope, extra cloud-init
actions, foreign references and the existing VM/audit refusals.

This is source qualification with explicit simulated execution and transport
fixtures. Candidate flags still refuse claims of qualified insertion or bootstrap
ownership. Original source lifetime, same-provider refresh across expiry, actual
guest capture and operational acceptance remain gates for the builtin installed
factory. All native/Terraform lifecycle, networking, traffic, cleanup/restoration,
ordinary Ubuntu `bun dev`, review/CI, publication and installed acceptance remain
required. Historical receipts, failed captures and immutable assets are preserved.
