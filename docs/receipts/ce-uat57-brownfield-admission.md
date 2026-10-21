# CE UAT57 brownfield admission

Public AWS Terraform apply and its admission workflow previously rendered a brownfield foundation without
qualified placement. Success and interrupted-bootstrap regressions reproduced the rejection before repair.

The public translation now validates immutable rollback snapshots. Admission prepares a durable binding only
for a fresh workflow, reloads it on resume and verifies two complete scoped cloud observations before runner
opening and each foundation/bootstrap apply. All initial, bootstrap and interrupted-output renders consume
the qualified placement. Replacement and ingress session openings reload the binding as well.

Foreign durable owners, conflicting bindings, missing resumed bindings, unavailable evidence and changed
references reject. Bootstrap interruption resumes without issuing another token. The existing creation-only
admission checks and separately qualified HA boundary remain intact. Original-route import and CE-target
replacement integration remain subsequent work.

## Validation boundary

Focused tests pass 37 tests / 164 assertions. The complete four-plugin suites pass 1872 tests / 11407 assertions.
Four compiler checks and runtime builds pass. Asset, schema mapping and readiness tests pass 8 tests / 44 assertions.
The coordinated candidate advances to platform 7.0.0-uat.57, AWS 3.0.0-uat.57, Azure 5.0.0-uat.57 and Terraform
3.0.0-uat.57. Archive installation and live owning-runner acceptance require separate receipts.

The repaired UAT56 head cd117a181fcdf509ea94706e7e9846820024a395 passed plugin/manifests CI 39523112239
and lint 39523112588. Current main 42872417a was reconciled with both branches' evidence preserved.

Readiness remains false: 288 required rows / 300 blockers. Recovery remains failed: 212977 ms versus 45000 ms.
Supported SLI-only control, publisher freshness, six-interface transitions, the complete live matrix, qualified
producer publication and consumption, independent cleanup and final UAT acceptance remain open.
Preserve Argo, CE-hosted vK8s and existing Marketplace images/offers. PR1565 remains draft with auto-merge off.
