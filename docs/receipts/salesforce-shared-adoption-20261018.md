# Salesforce shared-renderer adoption receipts

Milestone: marketplace [#1618](https://github.com/f5-sales-demo/marketplace/issues/1618),
under [#1591](https://github.com/f5-sales-demo/marketplace/issues/1591).
Historical acceptance remains in [the 2.3.11 baseline](salesforce-native-baseline-20261018.md).

## Immutable starting runtime

Downloaded v23.7.0 is source `286213af063de5ea145c2941233a686d950d72b3`,
which contains merged runtime PR #5010. Mac ZIP digest:
`988745c7eb55576eb607d7af9434c0875b852965ba80e48f2105057852bb0b56`.
The extracted CLI and native addon match their provenance manifest, the CLI
signature passes strict verification, and the downloaded CLI reports `xcsh/23.7.0`.

The downloaded Linux CLI matches release checksum and provenance:
`2c6f6b13d2e938594281aeb6d644fba909d3ba7e40f27070a69393bf3ea7396f`,
source `286213af063de5ea145c2941233a686d950d72b3`, and reports `xcsh/23.7.0`.
The separate modern native asset digest matches release/provenance on both hosts.
These are artifact checks, not Salesforce service probes.

## Runtime source

PR #5014 merged as `bc6b362b71d39fadf7493eed1cc70fe04ebc3b6d`.
The source-audit follow-up #5016 merged as
`8df7b7fe7b416b8e87fec71e1697b6f9a8b2c32f`.
The 42 focused presentation/layout/progress tests and full TypeScript workspace
check pass. The broader local package run reports 10,264 passed, 565 skipped and
12 failed; rerunning the affected files passes the audit, marketplace and process
checks. The remaining five Zig archive fixtures pass when GNU coreutils precedes the
Mac system tools on PATH (10 tests pass in that file). Every failed test from
the broad run has a passing focused rerun; the original broad-run receipt is
retained with its original counts.

## Salesforce candidate source

Removal commit: `45b9062d916c42e4b9368fa8066ee720f4bd2210`.
All six tools declare data-only presentations. The private renderer and progress
driver are removed. The 315 focused domain tests pass. Real shared ToolExecutionComponent and
Bash/Zsh command tests pass 1,248 assertions
across six tools, 40/76/120/153 columns, both expansion states, both themes and
Unicode/ASCII/Nerd presets, plus empty/unavailable/partial/failed results and
runtime progress teardown. This candidate source evidence does not establish
published-plugin or installed-native acceptance.

Runtime release PR #5017 merged as
`4eb990942babc21d670866e2819c42a82fc79aac` after the repository release script's
TypeScript and Rust checks passed on Ubuntu. Immutable tag `v23.8.0` resolves
to that release source; publication remains pending.

## Remaining delivery gates

Stable runtime publication, matching SDK locks, green plugin CI/merge, immutable
2.3.12 publication, matching Mac/Ubuntu installations, and fresh Mac native
fixture/read-only service acceptance remain pending. Ubuntu and NUC perform no
Salesforce service probes. Raw native captures remain private; sanitized findings
and provenance will be appended here after those gates run.
