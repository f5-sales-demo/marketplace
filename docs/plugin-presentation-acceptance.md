# Plugin presentation acceptance

The full 23-plugin catalog uses the shared presentation API introduced in xcsh
23.4.1. The complete Salesforce pilot requires xcsh 23.4.2, including the shared
XC-API-style thin frames. Executable plugins provide
presentation data; xcsh owns terminal layout, preview policy, theme and fallback
rendering. Content and integration plugins use the shared message and lifecycle
surfaces.

## Reproducible synthetic checks

Use the repository-pinned Bun 1.4.2. Run:

```sh
bash scripts/check-plugin-runtime-dependencies.sh --repair
bash scripts/check-ci-bun-lockfile-compatibility.sh
bash scripts/run-plugin-tests.sh
bash scripts/validate-plugins.sh
bash scripts/check-tests-are-hermetic.sh
```

The plugin runner exercises every catalog plugin through the exact published
runtime's installed-plugin discovery path. It checks presentation registration,
zero, false and null values without executing cloud commands. Plugin suites
cover domain mappings and integration lifecycle fixtures.

The shared renderer's regression suite and synthetic ANSI captures are in
[xcsh PR #4874](https://github.com/f5-sales-demo/xcsh/pull/4874). They cover
40, 76, 120 and 153 columns, both themes, symbol presets, expanded output,
renderer failures, Unicode, tables and lifecycle/setup controls.

## Salesforce acceptance

The 14 synthetic scenarios in `plugins/salesforce/benchmarks/prompts.json` cover
project evidence, account ambiguity, opportunity details, all six tools, partial
results, unavailable orgs and the read-only guard. Use the fixture Salesforce CLI
for those scenarios; it does not provision or modify infrastructure.

Use identical model, theme, Salesforce context and viewport for installed,
Bun development and packaged comparisons. Live reads:

```sql
SELECT COUNT(Id) total FROM Opportunity WHERE Id = null
```

The collapsed result must show `total = 0`. Query
`DefinitelyMissingDemoField__c` to check readable error guidance. Exercise org
display, describe, pipeline report, help and exec; expand, scroll and resize the
transcript. Review setup commands and cancel the review without executing setup.

Live output is kept outside the repository. Public renderer fixtures use
synthetic identities and records.
