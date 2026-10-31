# GCP qualification tracker input recovery

The current-main reconciliation left stale presentation input fingerprints at
source `ccc098a9fabb49455ede66ad35293c364bf6dc92`. Its plugin CI run
[40325830509](https://github.com/f5-sales-demo/marketplace/actions/runs/40325830509)
failed canonical tracker validation. Manifest, lint, workflow security and
installer checks passed at that source.

A fresh issue worktree from main `687541f9` retained the candidate. Pinned Bun
1.4.2 reproduced the shared and GCloud fingerprint failure before any repair.
The repository's `TRACKER_ACTION=update` path regenerated the tracker. A separate
row audit verified all 2,678 task IDs, 103 retired rows and historical evidence,
receipts and delivery links. It reopened 219 changed rows and preserved the
2,459 unchanged rows. Changed fingerprints require renewed acceptance.

The broader private-umask run also exposed a negative permissions fixture that
became private under umask 077. The test now explicitly sets its synthetic public
directory to mode 0755. The full permissions suite passes under the same private
umask. Production capture permissions and retained evidence remain private.

The next complete run exposed the local omission of CI's pinned PyYAML 6.0.3
fixture dependency and a Salesforce progress test that sampled only one timer
delivery. An isolated user-level Python environment supplies the exact CI
dependency. KVM source is unchanged. A controlled event-loop delay reproduced
the unchanged first spinner frame, followed by visible progress on the second
callback. The test now requires an actual changed rendered callback within one
second and always stops its timer. Completion, cancellation and late-update
assertions remain strict. The repository version tool synchronized Salesforce
2.3.16 metadata and the catalog.

The final repository-owned regeneration and separate audit reopened 346 changed
rows and preserved 2,332 unchanged rows, all 2,678 current IDs, all 103 retired
rows and prior evidence, receipts and delivery links. The complete repository
runner passed all 20 shipped shell suites and applicable TypeScript and Python
checks with pinned Bun 1.4.2, the exact CI Python dependency, umask 077 and
`TMPDIR=/private/tmp`. The catalog still contains 22 plugins. Focused renderer
and KVM regressions, catalog validation, changed-file Biome, applicable staged
pre-commit, PII enforcement and audit, and staged secrets checks passed. Biome's
existing informational finding is retained. CI at the delivered commit remains
required.
This receipt preserves the original failing runs and their executable and
configuration bindings.

The [issue acceptance matrix](gcp-issue-1559-acceptance.md) remains authoritative
for installed, guest, lifecycle, networking, traffic, recovery and publication
gates. q30 owned cleanup stays complete; its stopped reader, failed capture and
historical locks remain unresolved. Preserve q12 and immutable v12.3.1 assets.
