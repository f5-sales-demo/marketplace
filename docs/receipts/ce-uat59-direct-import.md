# CE UAT59 original direct route import

The original-route ownership collector and import translator previously had no public deployment caller.
AWS Terraform apply now invokes an ownership-bound import stage after registered brownfield admission.
A durable source resumes that stage directly, without rerunning bootstrap admission against imported configuration.

The stage freezes initial/import configuration and original cloud ownership before revision. It accepts only
exact import intents and no-op resource changes. Revision, plan, source-write and submission-marker interruption
recover from durable evidence. Apply response loss requires two identical provider-state observations and fresh
cloud observations before journal reconciliation; submitted imports are not replayed. Exact provider route IDs,
original targets, full selected route tables and CE interface ownership remain verified on completed resume.
Foreign owners/imports, mutating plans, missing receipts, changed configuration/state/cloud evidence reject.

## Validation boundary

Focused validation passes 87 tests / 150 assertions; complete four-plugin suites pass 1888 tests / 11461 assertions.
Four compiler checks and builds pass. Candidate versions are platform 7.0.0-uat.59, AWS 3.0.0-uat.59,
Azure 5.0.0-uat.59 and Terraform 3.0.0-uat.59. Exact installed execution and live route preservation remain
separate gates; the installed synthetic execution below qualifies only the former. The result is pending-direct-route-transition; no CE-target activation or verified-up telemetry
is inferred from importing originals. Activation is the next implementation stage with its own evidence gate.

Exact UAT58 head964eb3b43c36d3fe291703bab1240759522d30d6 passed plugin/manifests39527044253 and
lint39527044636. Current main04733b385 was reconciled before editing; both branches' evidence is retained.

Readiness remains false:288 required rows/300 blockers. Recovery remains failed:212977ms versus45000ms.
Vendor SLI control/freshness, six-interface transitions, the complete live matrix, qualified producer assets,
independent cleanup and final UAT acceptance remain open. Preserve Argo, CE-hosted vK8s and existing images/offers.
PR1565 remains draft with auto-merge off. No UAT delivery or normal publication.

## Installed public execution

Exact59archives execute publicaws_ce_apply on isolated xcsh23.8.0/23.9.3 through complete real preflight
and original-route import with synthetic cloud/runner. Both lanes verify completed resume and apply-response,
submission-marker and revision-response interruption. All eight cases import exactly once and have zero CE
source-checkout reads. Cloud preservation and CE-target activation remain unqualified.

CI39532138961 failed on stale AWS presentation fingerprints. The same failure reproduced locally before
tracker reconciliation; update/check now pass478assertions each. Incoming mainf09851f893 merged cleanly;
its observer/qualification suites pass38tests/254assertions. All four CE plugin trees remain unchanged.
