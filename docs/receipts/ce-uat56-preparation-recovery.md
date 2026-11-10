# CE UAT56 preparation recovery

Early direct-route retirement preparation could leave restoration source or relinquishment plans absent
under a submission-pending marker. Nine interruption regressions reproduced failed recovery before repair.

The owning AWS Terraform lifecycle now persists exact initial/restored/removal configuration and provider
route identities before revision. Source-bound preparation checkpoints permit recovery of revision/plan
response loss before submission. Durable receipts are reused; submission-pending checkpoints require them.
Source-only orphan recovery requires unchanged initial configuration, exact state, fresh cloud identity and
absence of saved plans. Complete distinct selected aws_route IDs must match the qualified provider translation.

Changed configuration, missing/duplicate/foreign state, unavailable cloud observations, or a submitted journal
in a preparation phase reject. Restoration refresh retains its separate checkpoint. Apply response loss still
requires exact applied-state/cloud reconciliation; restoration and forget are never replayed.

## Validation boundary

Focused validation passes 95 tests / 339 assertions; the four-plugin suite passes 1863 tests / 11368 assertions.
Incoming plugin regressions pass 29 tests / 105 assertions. Four compiler checks and builds, runtime assets,
public schema mappings, readiness, manifests, Markdown inventory, staged PII and diff checks pass. All four candidate
versions advance together: platform 7.0.0-uat.56, AWS 3.0.0-uat.56, Azure 5.0.0-uat.56, Terraform 3.0.0-uat.56.
Archive installation, exact installed execution and live route/network preservation remain separate gates.

Exact UAT55 head 8a961d49c6c6e227ab77de97c88455826815e02f passed plugin/manifests CI 39515681801 and lint
39515682377. Current main 0839044bf was reconciled before this implementation; upstream plugin evidence remains.

Readiness remains false: 288 required rows / 300 blockers. Recovery remains failed: 212977 ms versus 45000 ms.
Supported primary-owner SLI-only control, original publisher freshness, six-interface up/down/up, the complete
AWS/Azure native/Terraform live matrix, qualified producer assets before repinning, independent cleanup and
scanner convergence remain open. Preserve Argo, CE-hosted vK8s and existing Marketplace images/offers.
PR1565 remains draft; UAT delivery and normal publication require explicit acceptance after all gates pass.
