# Original final inventory after before-phase retirement

Terraform 2.4.170 preserves unchanged original inventory for the exact final
callback after before-phase access ends. Full deployment and guest acceptance
for [issue #1559](https://github.com/f5-sales-demo/marketplace/issues/1559)
remain unfinished; [PR #1698](https://github.com/f5-sales-demo/marketplace/pull/1698)
remains draft.

## Source repair

A failed before-phase inventory read previously retired the retained baseline
for every phase. The reader now uses the original controller's authenticated
lifetime-end classification to retire before access separately. The exact final
callback revalidates original owner, execution identity, nonce, plan and absence
bytes within the existing five-minute reserve. Before work cannot reopen.
Changed or restored evidence, credential rotation, foreign callbacks and final
expiry retain their permanent refusals.

The held factory also passed a before callback as the final-only baseline-reader
argument. That draft now uses the correct before API. It remains inactive and
untracked. Its expanded native test exercises a released disposable actor's
natural exit and successful final inventory capture. Native output capture
flags are checked against the original completion bytes; failed guest and
provider evidence stays failed.

## Verification

Failing-first native and direct callback cases reproduced the handoff defect.
Private failed checks, original captures, temporary synthetic diagnostic output
and exact source-restoration evidence remain retained.

- Full native factory and typed cleanup draft cases: 18 passed, 183 assertions.
- Related baseline, ownership, clock, callback, trace, bootstrap and guest-binding
  regressions: 58 passed, 448 assertions.
- All three full strict typechecks, normal three-plugin runtime build, catalog
  generation/check, dependency audit and warning-clean changed-file lint passed.

These tests use actual native processes and original callback/source issuers with
offline cloud replies. No GCP resource apply occurred. A complete output capture
or natural actor exit does not establish guest or deployment acceptance.

## Remaining acceptance

The [installed runtime receipt](gcp-current-installed-runtime-20261124.md)
qualifies the earlier Terraform 2.4.169 candidate. The changed 2.4.170 snapshot
requires its own supported installation and ordinary Ubuntu `bun dev` check.

Complete factory before/final guest capture and same-original-provider renewal
across real expiry, then native and Terraform single-node and three-node
lifecycle, networking, content-verified traffic, recovery timing, teardown and
restoration. Review, passing continuous integration, merge, publication and
published installation remain required. The retained empty-owner profile lock,
historical collector failures, unresolved executor locks and immutable v12.3.1
assets remain preserved.
