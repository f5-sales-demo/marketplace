# CE UAT66 submitted F5 reconciliation

An interrupted F5 Terraform create/update could leave a submitted saved apply whose API and provider-state outcome was already exact. Pending-admission teardown rejected that
state, while the existing general reconciliation service could also execute an unsubmitted request. Preparation needs a separate operation that cannot replay apply.

The typed `RECONCILE_OBSERVED` operation now requires a durably submitted saved apply, checks the owning book again under its lock and proves the original request against provider
state and API readback. It reconciles the original saved-apply journal without a second provider apply. Missing, foreign, malformed or unavailable evidence leaves the pending
operation unresolved. The apply branch explicitly rejects observation-only execution.

Pending teardown preparation invokes this operation only for the selected original site create/update, matching deployment owner, request coordinates and original plan
authorization. It then gathers the complete stable inventory and immutable retirement plan. Unsubmitted or unproven requests retain a separate rollback/reconciliation gate. Single-
node/non-HA mutation guards remain unchanged.

Validation passes 1947 four-plugin tests / 11752 assertions, 98 focused runtime/provider/pending tests / 450 assertions, platform/AWS/Terraform compiler checks and four builds. All
four versions advance together to UAT66. Installed and real live qualification remain separate gates.

Prior UAT65 plugin CI 39594332273 passed at commit 10001333ec87f72b4014269c0dd0323a06baf525. UAT66 retains the canonical tracker update after final plugin edits and independent
staged fingerprint validation.

Readiness remains false: 288 required rows / 300 blockers. Recovery 212977 ms against 45000 ms remains failed. Vendor SLI control/freshness, six-interface transition, complete
AWS/Azure matrix, immutable producer qualification, independent cleanup, fleet convergence and explicit UAT acceptance remain open. PR1565 stays draft with auto-merge disabled.
This candidate is not a complete UAT deliverable.
