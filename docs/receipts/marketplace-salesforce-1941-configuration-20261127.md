# Salesforce 3.0.1 configuration acceptance

Verified on the managed MacBook on 2026-11-27. This receipt qualifies the Salesforce delivery checks, merge, immutable artifact, supported service, and implementation cleanup gates.

## Delivered source and publication

- [Implementation PR #1950](https://github.com/f5-sales-demo/marketplace/pull/1950) merged at `4b4160a7e4a35c0248c4ba57c0fb8bac9f17f1b7`.
- [Salesforce 3.0.1](https://github.com/f5-sales-demo/marketplace/releases/tag/salesforce/v3.0.1) is immutable and targets that exact source. All 110 normally installed files, membership and executable modes match the tag. Installed tree receipt SHA-256: `bf12022e98ac4af7bad3e4baec521fa39a2f2250cc0f3e2d66823d8445ca78db`.
- [xcsh 25.2.0](https://github.com/f5-sales-demo/xcsh/releases/tag/v25.2.0) is immutable at `f03cd7c692f5aafecb1bec466d3dc6eef8f59190`, containing the corrected ready-state configuration review.
- The normal Homebrew installation matches release digests and passes strict signature verification for the Mac ARM binary and native addon. Binary SHA-256: `daf9696284ad42b6f583aafe0b2f0fc5defe574353a95d18a735f67fb45d6413`; native addon SHA-256: `ed4a54f006ecfa5799ee87d1848fdb4fb6f57184a0ba89feaa55c3e7886a02ee`.
- The normal isolated npm SDK installation matches registry integrity, gitHead and all 1,188 published SDK source files. The installed CLI guard was verified independently.
- [Published English requirements](https://f5-sales-demo.github.io/marketplace/en/plugins/salesforce/) state xcsh 25.2.0 or later.

## Verification

- The real integration-context regression fails with the old hardcoded verifier and passes with delegation to the registered probe.
- Salesforce's exact 25.2.0 minimum lane has 366 passing tests. The frozen dependency policy, policy regressions, full plugin suites, hermeticity, catalog validation, Salesforce type checking, privacy enforcement and applicable commit hooks pass. Other plugin dependency graphs and root validation runtime 23.8.0 remain byte-identical.
- [PR plugin validation](https://github.com/f5-sales-demo/marketplace/actions/runs/46086134906), [PR lint and shell tests](https://github.com/f5-sales-demo/marketplace/actions/runs/46086135140), [merged-source validation](https://github.com/f5-sales-demo/marketplace/actions/runs/46086465052),
  [plugin publication](https://github.com/f5-sales-demo/marketplace/actions/runs/46086465007), [Pages deployment](https://github.com/f5-sales-demo/marketplace/actions/runs/46086465239), and [complete runtime release CI](https://github.com/f5-sales-demo/xcsh/actions/runs/46079866777) all finished successfully.

## Installed and live acceptance

Tool evidence tier: `installed-plugin-module`, using the normally installed plugin and the independently verified published SDK. Reviewed setup used the installed Homebrew CLI.

- Live identity matched the private preflight before setup.
- Normal `xcsh plugin setup salesforce` completed all six review stages, saved approved standard defaults, reused authentication and executed no OAuth login. Configuration permissions are 0600; its directory is 0700.
- `sf_query`, `sf_describe`, `sf_org_display`, `sf_pipeline_report`, `sf_help` and `sf_exec` all passed live read-only checks with credential-safe results.
- Independent owner and team queries matched standard Opportunity Amount totals and currency coverage. Coverage is owner or team; unconfirmed quota was not inferred.
- Private configuration SHA-256 before and after the read-only checks is identical: `ada6e0df161468f22934c08aab153c592cbee3ff65e3fa9871a08920e6135112`.

Raw org records, identity, configuration and setup transcripts remain private outside Git. Failed attempts were retained privately, including the registry metadata/tarball propagation gap and the missing isolated PyYAML path.

## Implementation cleanup

The #1950 worktree and confirmed merged branch were retired after proving identical branch and merge trees, archiving and reading back all 1,644 source files, and inventorying rebuildable ignored dependencies. Archive SHA-256: `82f7f2c093452c2e5b3fb76434b472ca6b2b3fabe3a98e7a3bbc6ff0ea4e8375`. The primary Ubuntu checkout is clean and current; unrelated work and prior receipts were preserved.
