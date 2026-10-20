# Devcontainer retirement

Campaign: [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Delivery: [#1707](https://github.com/f5-sales-demo/marketplace/issues/1707).
Former acceptance: [#1587](https://github.com/f5-sales-demo/marketplace/issues/1587).

The user authorized immediate removal of the deprecated Devcontainer plugin.
The abandoned status repair was preserved privately with a verified archive;
its original worktree remains intact. No repaired plugin version was published.

Removal source: `fd70eb54f3685036da3fc8fec9d8dd1834a3478d`.
All plugin files, the marketplace entry, qualification order and integration
expectations were removed. The English installation page now records retirement.
Existing installations and historical immutable releases are retained.
Translations retain their historical release content under repository policy.

## Tracker reconciliation

All 87 current `devcontainer.*` IDs moved to the retired appendix with every
original status, scope, acceptance, evidence, receipt, delivery, blocker and
fingerprint preserved. Each retirement has the removal source SHA and delivery
issue. The 16 previously retired Salesforce rows remain intact. Every other
plugin row is unchanged. Shared catalog evidence was invalidated by normal
reconciliation; it requires current catalog qualification before VERIFIED.

Discovery remains on runtime 23.8.0. The active inventory has 22 plugins,
314 surfaces and 2,670 tasks. Minimum 23.5.1 and stable 23.9.3 lanes are unchanged.

## Verification

On macOS, catalog removal first failed the 22-plugin catalog assertion. After
removal, lifecycle and qualification checks passed: 79 tests, 745 assertions.
Tracker and ownership checks passed: 12 tests, 506 assertions. Independent
comparison confirmed all 87 retirement rows preserve their historical fields
and every unrelated plugin row is unchanged. Generated catalog validation,
changed-scope privacy enforcement and privacy audit pass.

Required Linux CI remains separately enforced by the linked delivery PR.
Removal retires acceptance; it does not assert installed or service behavior.
No services, accounts, infrastructure, meetings or external communications were
used for this removal.
