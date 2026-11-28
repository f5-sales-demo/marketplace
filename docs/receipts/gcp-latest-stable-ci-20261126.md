# GCP latest stable CI qualification

The seven-day eligibility window is removed. New qualification selects the
latest stable release immediately and records its exact artifacts and hashes.
Historical executors, cleanup identities, failed evidence and immutable
v12.3.1 assets retain their original bindings.

PR #1698 source commit `9d0289949b39e0a8aa74ee30952cfedfff2c9f51`
exposed a CI consistency check that required the literal `bun-types ^1.4.4`.
It rejected the qualified exact `1.4.5` dependency. CI now selects Bun 1.4.5
using verified official Linux x64 and arm64 asset digests. Lockfile format 2
and the exact runtime check remain enforced.

The consistency check accepts exact and caret stable declarations when the
locked package satisfies the declaration and the selected runtime API family.
It rejects a newer unqualified runtime requirement, stale API families,
declaration/lock disagreement, unreviewed ranges, prereleases, absent or
ambiguous locked packages and malformed manifests.

Failing-first evidence and 16 fixture cases are retained. All 19 tracked shell
unit suites, the real candidate consistency check, actual lockfile gate,
plugin-runner regressions, ShellCheck and repository shell formatting pass.
The newly added fixture suite is included in that total.

The nonexistent precondition test selected in attempt a4228 contributed zero
tests. The four preceding successful checks retain their original results.
The mistaken extra shell-format flag in a4229/a4230 was corrected after reading
the exact diff and repository settings; original failures remain preserved.

xcsh v25.1.1 source `781c424d963dc299e2f09bb08d84c64bfc7ab6a5`
passed a fresh normal frozen bootstrap, dependency verification, source-matched
native compilation, native export probe and CLI version check with Bun 1.4.5.
The supported expected-version input was used. Older runtime source version
declarations still require an upstream correction and requalification.

Current-head GitHub CI remains a separate gate. PR #1698 remains draft and
retains Closes #1559. Supported marketplace installation, ordinary Ubuntu
`bun dev`, successor guest capture, same-provider expiry renewal, full GCP
lifecycle/network/topology/content traffic, recovery, independent cleanup and
restoration, review, merge, publication and published installation remain open.
No cloud campaign was submitted for this correction.

Attempts a4222 through a4232 retain private source, execution and failure
evidence. This receipt does not mark #1559 complete.
