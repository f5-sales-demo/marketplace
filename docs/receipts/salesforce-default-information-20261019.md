# Salesforce default information source verification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1636>. Candidate plugin: 2.3.14. Base source: 19b852abf5f9712b19920c2131d135f7189fdc9d. Host: verified Ubuntu workstation. SDK and minimum runtime: 23.8.0. Test toolchain: Bun 1.4.2.

The collapsed shared-renderer output now includes explicit connection status, standard/custom field and
child-relationship counts, filtering guidance, fiscal-year bookings with explicitly unknown currency, and
complete actionable anomaly messages and affected-account details. Twelve-row previews and currency-separated
totals remain. Raw metadata, recent changes and source-query evidence remain available on expansion.

Tests were written first against registered tools rendered by the real ToolExecutionComponent. The initial
eight width/theme cases failed because Connected was absent. After implementation and updating prior
concealment expectations, `bun test plugins/salesforce/test` passed 336 tests with 2313 assertions. This
includes the existing six-tool 40/76/120/153-column, dark/light, Unicode/ASCII/Nerd, collapsed/expanded
matrix, corrective-guidance cases and progress cleanup regressions.

`bun test tests/presentation-tracker.test.ts tests/presentation-ownership.test.ts
scripts/presentation-inventory.test.ts` passed 12 tests with 523 assertions. Inventory: 23 plugins, 324 active
surfaces, 2757 tasks. CI Bun lockfile compatibility, generated catalog check and plugin manifest validation
passed. The full global `bash scripts/check-tests-are-hermetic.sh` passed after frozen dependency installation
in the fresh worktree; no plugin test depends on a real cloud CLI. Changed-scope PII audit and `git diff
--check` passed. Tracker reconciliation retains prior receipts and reopens source-sensitive acceptance.

This receipt establishes candidate source behavior. Publication, immutable artifact provenance, installation, fresh native fixture capture and corporate MacBook read-only service acceptance are separate gates. Historical 2.3.13/23.9.1 captures remain baseline evidence and do not qualify 2.3.14. Desktop font raster fidelity and model selection require their own evidence.
