# CE UAT58 brownfield preflight

Real AWS Terraform preflight unconditionally rejected brownfield deployment before discovery. A source
regression reproduced the rejection independently of the mocked preflight used by earlier apply tests.

Preflight now validates supported deployment ownership and immutable brownfield snapshots before cloud
inventory. Discovery and comparison retain all brownfield resource references in addition to explicit route
references. Missing or changed evidence for each of the six placement references rejects. Existing identity,
profile, image, agreement, capacity, source provenance and TGW ownership checks remain enforced.

## Validation boundary

Focused checks pass 40 tests / 190 assertions. Complete four-plugin suites pass 1874 tests / 11424 assertions.
Four compiler checks and builds pass. Real preflight reaches the correctly scoped cloud inventory in the
regression; the intentional unavailable-inventory response rejects. This proves code execution and fail-closed
routing only, not complete installed/live preflight acceptance. The independent admission binding still verifies
two complete current observations before opening/apply. Public original-route import and replacement remain open.

Candidate versions are platform 7.0.0-uat.58, AWS 3.0.0-uat.58, Azure 5.0.0-uat.58 and Terraform 3.0.0-uat.58.
Exact archives, installed execution, CI and live acceptance remain separate gates.

Readiness remains false: 288 required rows / 300 blockers. Recovery remains failed: 212977 ms versus 45000 ms.
Vendor SLI control/freshness, six-interface transitions, full native/Terraform AWS/Azure live matrix, qualified
producer assets before repinning, independent cleanup and final UAT acceptance remain open.
Preserve Argo, CE-hosted vK8s and existing Marketplace images/offers. PR1565 remains draft with auto-merge off.
