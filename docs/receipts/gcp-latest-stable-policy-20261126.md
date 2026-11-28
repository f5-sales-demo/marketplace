# GCP latest stable dependency qualification

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Delivery: [draft PR #1698](https://github.com/f5-sales-demo/marketplace/pull/1698).
Attempts: 4194 through 4217. Full issue acceptance remains incomplete.

## Release selection

The user removed the seven-day eligibility window for this prerelease project.
New qualification selects the latest stable release immediately, with a minimum
release age of zero. Publication date is evidence, never a reason to hold an
older version. New releases receive fresh artifact, schema, dependency, source
and runtime qualification before their consumer paths are accepted.

Exact versions and hashes record each reviewed campaign's inputs. Existing
executors and cleanup continue using their original identities and saved plans;
they do not silently switch to a newer executable. Historical receipts, frozen
collectors and immutable v12.3.1 assets retain their original attribution.

## Current qualified inputs

| Component | Version |
| --- | --- |
| Terraform | 1.17.2 |
| Google provider | 8.12.0 |
| XC provider | 15.17.9 |
| xcsh SDK and validation runtime | 25.1.1 |
| Bun | 1.4.5 |
| Biome | 2.6.9 |
| TypeScript | 7.0.2 |
| QMD | 2.9.0 |
| Bun types | 1.4.5 |
| Google authentication library | 11.3.4 |

Official metadata and authenticated provider installation qualify the current
Terraform/provider tuple. New deployments select that tuple with its exact
provider lock. Current Site access, observer, bootstrap, preapply and original
executable profiles are versioned; historical cleanup profiles remain intact.
Documentation-only schema changes do not change the executable field contract.

GCloud, Platform and Terraform use the current direct dependencies, with SDK
25.1.1 as their minimum runtime. Their normal runtime builds and typechecks pass.
The validation harness also uses SDK 25.1.1 and QMD 2.9.0 after normal frozen
installation. Installation hooks were inspected without changing trust rules.

## Verification and limits

Failing-first evidence covers current defaults and mappings, direct dependencies,
Google authentication type coherence, the runtime dependency checker and the
previously stale validation harness. The shared Google authentication override
resolves the actual SDK and GenAI dependency mismatch. A loopback SDK request
verifies initial and rotated explicit credentials and response content; it does
not establish live Google renewal.

The current regression run passes 75 mapping, composition and authentication
tests, 31 shared runtime tests, 908 Platform/GCloud CE tests and 108 Terraform
capture tests. All three typechecks and dependency checks pass. The published
parser validates 23 agents; 26 workflow tests and 98 adjacent tests pass under
SDK 25.1.1. Minimum-runtime regressions pass.

The Terraform command listed a nonexistent standalone preapply test file.
Its actual coverage is 108 tests across ten existing files. Preapply behavior
is exercised by the installed creation composition suite; no standalone
preapply test coverage is claimed. The original logs and their correction
remain preserved privately.

The canonical tracker is regenerated for the changed source and runtime while
retaining prior evidence, receipts and retired rows. A runtime change reopens
affected acceptance gates; previous live receipts do not qualify changed bytes.

Fresh supported installation and ordinary Ubuntu `bun dev`, a successor live
collector, original provider expiry renewal, all requested lifecycle/network
and traffic campaigns, independent cleanup and restoration, current CI and
review, merge, qualified publication and published installation remain open.
No cloud campaign is submitted by this source qualification. q12 remains closed
as presumed transient with its cause unknown.
