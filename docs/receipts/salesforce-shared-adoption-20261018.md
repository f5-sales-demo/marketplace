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
to that release source; publication is recorded below.

## Verified compatible runtime

Immutable v23.8.0 has 28 assets at source
`4eb990942babc21d670866e2819c42a82fc79aac`. Mac archive SHA-256:
`e7aa58176a9e9de71324d69ea916bc9082245c3cd03cdd418b40926b858deb80`.
CLI SHA-256: `141c99a007b99964c63063a0bf9bd27327d8d944d5c2bbd095ac7d5b431d58e3`.
Native addon SHA-256: `14ed5e15b6234652f7f8167d29a15042a5c901dac33a0f8014cbf1657a76d6fa`.
Both extracted files match provenance and pass strict signature verification.
The actual installed Mac binary matches the CLI digest and reports 23.8.0.

Linux CLI SHA-256: `a27d2cf6068be3c1d26376e691dc2c77ab78e4abfb2994dd6a875d19b36d4f6b`.
Download, release checksum, provenance and installed Ubuntu binary agree; the
installed binary reports 23.8.0. No Salesforce service probe ran on Ubuntu.

The original tag run's Intel native signing assessment passed on retry. Intel
MDM validation encountered Apple ticket-delivery Error 68 and passed in the
verification-only retry. npm's ordinary publish retained its Terraform corpus
freshness failure. The canonical exact-tag backfill
[39158491865](https://github.com/f5-sales-demo/xcsh/actions/runs/39158491865)
passed using the original qualified index. Published SDK gitHead is the same
release source, and canonical latest is 23.8.0. Historical failed outcomes remain
in the original run; no immutable asset or tag was rewritten.

## Final adapter source qualification

Implementation source: `7f4b04e1b26c3509491cdfa1eb32dfa86d3034c8`.
All 325 Salesforce tests pass with the actual published 23.8.0 SDK. The common
marketplace matrix passes 24 tests and 21,737 assertions through all 23 plugins.
Dependency fixtures pass all ten checks, including rejection of a development
runtime below the declared minimum. Catalog and tracker checks pass. The tracker
has 324 active surfaces and preserves 16 retired progress-registration rows.

The Mac full-suite attempt also records unrelated GitLab, KVM, Xorg and Zoom
platform-fixture failures; its early hermeticity attempt ran before all fixture
dependencies existed. The complete required source/hermetic qualification is
being repeated on the verified Ubuntu CI route. These failures are retained,
not presented as passing Mac suite evidence.

## Remaining delivery gates

Ubuntu full plugin/hermetic checks, green plugin CI/merge, immutable 2.3.12
publication, matching plugin installations, and fresh Mac native fixture/read-only
service acceptance remain pending. Ubuntu and NUC perform no Salesforce service
probes. Raw native captures remain private; sanitized findings and provenance
will be appended after those gates run.
