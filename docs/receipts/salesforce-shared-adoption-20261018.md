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

Implementation source: `5b772359e6165240e30286f14d4aa70180aa01c1`.
All 325 Salesforce tests pass with the actual published 23.8.0 SDK. The common
marketplace matrix passes 24 tests and 21,737 assertions through all 23 plugins.
Dependency fixtures pass all ten checks, including rejection of a development
runtime below the declared minimum. Catalog and tracker checks pass. The tracker
has 324 active surfaces and preserves 16 retired progress-registration rows.

The Mac full-suite attempt also records unrelated GitLab, KVM, Xorg and Zoom
platform-fixture failures; its early hermeticity attempt ran before all fixture
dependencies existed. The full Ubuntu plugin runner passes all suites after materializing the test
dependencies and providing task-owned PyYAML to the sanitized Python environment.
The Ubuntu hermeticity check passes with real cloud CLIs replaced by controlled
stubs. These Mac failures are retained, not presented as passing Mac suite evidence.
The privacy enforcement check is clean. The final Account column label uses the
existing domain label map; all 325 targeted tests still pass.

## Historical pending gates (before publication)

Final-source Ubuntu verification, green plugin CI/merge, immutable 2.3.12
publication, matching plugin installations, and fresh Mac native fixture/read-only
service acceptance remain pending. Ubuntu and NUC perform no Salesforce service
probes. Raw native captures remain private; sanitized findings and provenance
will be appended after those gates run.

## Immutable plugin and installed provenance

PR [#1619](https://github.com/f5-sales-demo/marketplace/pull/1619) merged with
green plugin, manifest, security and lint checks. Delivered source and immutable
`salesforce/v2.3.12` tag resolve to `6baa863dd26919ba8e2e906bc716d23de6e06f1a`.
Downloaded source archive SHA-256:
`624664ad5b71cdfd871f73995c3ae3874cc9c9c22b6533340eb9d1f1e8b41d77`.
Release immutability was enabled and the existing release republished at the same
tag. No source or tag bytes changed. Both releases report immutable publication.

Both Mac and Ubuntu installations report runtime 23.8.0 and Salesforce 2.3.12.
All 100 installed plugin files on each host match the tag's Git blobs. The Mac
resolves the published Caskroom binary; Ubuntu resolves its atomically installed
local-bin binary. Their digests are recorded above. Mac module acceptance reports
ready and passes read-only `sf_org_display`; setup was never executed. Ubuntu
module review performed no service probe or setup. Source/CI, publication,
installation and service evidence remain separate gates.

## Published MacBook native acceptance

Private evidence identifier: `salesforce-2.3.12-shared-20261018`.
Original frames, inspection journals, manifests, argv reconstruction and Herdr
viewport evidence remain in its `fixture` and `live` directories. No raw service
output, identity data or credentials are published here.

The actual published runtime 23.8.0 and installed Salesforce 2.3.12 produced:

| Run | Cases | Inspected frames | Failures | Pipeline execution repaints | Post-completion repaints |
| --- | --- | --- | --- | --- | --- |
| Fixture | 13 | 780 | 0 | 7 | 0 |
| Read-only live | 6 | 360 | 0 | 321 | 0 |

Both runs cover 40/76/120/153 columns plus the original 150-column startup
viewport, collapsed/expanded, both themes and Unicode/ASCII/Nerd. Fresh native
geometry confirms the task-owned terminal lease allocated 160 columns. Every
inspected frame fits that allocation. All 1,140 frame SHA-256 values match their
inspection journal. Frames were inspected individually; Herdr viewport evidence
remains a separate tier.

All six live tools succeed: `sf_exec`, `sf_query`, `sf_describe`, `sf_org_display`,
`sf_help` and `sf_pipeline_report`. Fixtures additionally exercise empty,
unavailable, partial, failed, monetary, zero, literal and exact-command cases.
Bash and Zsh reconstruct rendered commands against declared argv with a private
recorder, preserving filters and scope. Real shared-component regressions cover
full fields, single safe evidence, completion cues and fallback warnings.
Source progress tests cover cancellation, shutdown, context replacement and late
updates. Installed runs establish progress and completion only.

Both capture sessions acknowledged stop through completed manifests, terminal
control leases exited and task-owned fixture/live panes were closed. The root
pane and unrelated sessions remain. Long capture environments now use owner-only
launch scripts. The driver requires fresh same-installation geometry evidence
and rejects insufficient allocation. Five standalone Python capture tests pass,
including command reconstruction and geometry/provenance rejection.

## Remaining surface gates

The shared-renderer adoption and automated published Mac acceptance are qualified.
[#1591](https://github.com/f5-sales-demo/marketplace/issues/1591) remains open for
other registered lifecycle, command, skill and agent surfaces. Their next action
is a safe executed example with installed evidence for each canonical ID.
Expanded native buffers establish full output; terminal viewport scrolling still
requires its own observation. Installed cancellation/context-replacement checks
remain separate from source teardown tests. Herdr/ANSI evidence does not establish
desktop-font raster fidelity or model tool selection. Neither Ubuntu nor NUC
performed Salesforce service probes or authentication repair.

Task worktree cleanup remains separate until adoption and receipt worktrees are
retired after merge. Historical receipts and private captures remain preserved.
