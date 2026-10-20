# ASM Migration 2.3.2 readiness source qualification

Campaign #1579, child #1600, normal lifecycle follow-up #1723, focused fix #1724.
A missing Bun executable previously threw ENOENT from the readiness probe and
became a generic invalid response. The probe now reports
`setup_required/dependency_missing`. Zero/nonzero exit status behavior is preserved;
unexpected permission and null failures are rethrown unchanged.
The original failing regression is preserved privately.

The patch version is synchronized through repository automation. The development
runtime and frozen lock resolve to independently verified stable 23.9.4;
minimum compatibility remains 23.5.1. Discovery remains 23.8.0.
Runtime 23.9.5 publication was still pending during these source checks.
The production bundle rebuild is byte-identical to its prior source artifact.

On verified Ubuntu, Bun 1.4.2 passed all 63 ASM tests with 1,284 assertions,
strict TypeScript, bundle consistency, shell structural checks, catalog generation,
manifest validation and lock compatibility. The isolated minimum-runtime lane
also passed all 63 tests and 1,284 assertions. Full marketplace suites,
canonical tracker and renderer ownership checks passed. The independent
hermeticity check passed with no real cloud CLI dependency. Biome passed the
changed scope; existing test-only warnings remain.

Affected fingerprints reopen previous acceptance conservatively. Historical
receipts and the eight explicit runtime, account and human blockers are preserved.
These source checks do not establish publication, installed presentation, reviewed
human setup or service acceptance. Immutable release verification and installed
lifecycle qualification remain in #1723. Account-dependent gates remain deferred
by the user. Raw failures and verification logs remain private.
