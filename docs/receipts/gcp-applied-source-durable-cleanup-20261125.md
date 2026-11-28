# Durable successful-source cleanup provenance

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

GCloud 1.7.82 preserves the original successful source authorization, complete
applied state, saved create plan, applied checkpoint and reader inputs in shared
immutable Platform storage before a destroy plan replaces that checkpoint.
Recovery verifies immutable evidence, the original selected endpoint, independent
reader closure, exact resource identities and fresh cloud and Platform ownership.
Credential rotation within that endpoint is supported.

A reviewed planned destroy remains bound to its original state. Interrupted
deletion returns the surviving original subset and requires a new review. Completed
cleanup resumes retain the original applying evidence and perform observations
without invoking Terraform or submitting an action, including after a final empty
destroy replaces the checkpoint. Recovery grants no delete authority. Successful
lock retirement is supported; retained locks still require physical checks, and
independent original reader closure remains mandatory.

No failed capture flags or substitute public deployment journals are created.
Captured cleanup, historical receipts and immutable v12.3.1 assets remain preserved.

## Verification

The missing durable module failed the baseline run while all 20 existing origin
cases passed. A subsequent failing-first probe showed that a malformed Terraform
action collection was incorrectly accepted; the repaired check requires an actual
empty array. The focused suite passed 41 cases and 228 assertions, including a fresh
Bun process, concurrent resumes, stale review, state rollback, replacement identities,
changed immutable files, credential rotation and context changes during closure.

The affected GCloud, Platform and shared cleanup suites passed 876 cases and 4,461
assertions across 137 files. Strict GCloud and Terraform typechecks and normal
runtime builds passed. Four unused fixture imports were removed before strict lint.
Catalog, dependency, documentation and staged privacy checks precede the commit.
Cloud and Platform responses are synthetic in these tests; they prove source
behavior and storage durability, not real deployment or live cleanup.

## Remaining acceptance

Concrete successful and captured cleanup workers still need pinned live execution
clients, the complete original reader set and independent physical closure. The
prepared campaign remains unsubmitted. Rebuild its worker against current source
and refresh image, supported provider, legal, funding, saved-plan and 21-resource
absence evidence before one apply. Full native and Terraform networking, lifecycle,
traffic, expiry refresh, interruption, cleanup and restoration, ordinary installed
configured-model Ubuntu runtime, current-head review and CI, merge, publication
and published installation remain unfinished.
