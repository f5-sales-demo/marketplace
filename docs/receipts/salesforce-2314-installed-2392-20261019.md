# Salesforce 2.3.14 qualification on xcsh 23.9.2

Final qualification: <https://github.com/f5-sales-demo/marketplace/issues/1645>.
Parent acceptance: <https://github.com/f5-sales-demo/marketplace/issues/1624>.
Plugin delivery: <https://github.com/f5-sales-demo/marketplace/pull/1637>.
Runtime cue: <https://github.com/f5-sales-demo/xcsh/pull/5032>.

## Publication and installation

The immutable runtime tag v23.9.2 resolves to
`6105cf4e04e12f8c2bd45c911a8a3bdf3bf567b5` and includes the shared expansion
cue change. The published Darwin arm64 archive SHA256 is
`c5593ab79ef65374e9d76e61d05c69c7094654c9db0b998ca7b64b5161f9480d`;
the matching provenance asset SHA256 is
`57fe16d8abb0a2f2a2444605ecd8d1f289c4a5e8996a102c70fe8f8458d05f64`.
The strict exact-tag signature and installed-layout provenance verifier passed
on the normal MacBook Homebrew installation. Installed binary SHA256:
`548e060ef1659030b05ead7d5387880d9d9c545e0d7e8cfcb395c11037fb1bf0`.

Ubuntu's documented standalone installation independently reports runtime
23.9.2, source `6105cf4e04e12f8c2bd45c911a8a3bdf3bf567b5`, release run
39296649052 attempt 1, and binary SHA256
`6e58865658d3266317e870e190c26e1823a048b1819d92fe646bb598b21ef993`.
No Ubuntu service probes were performed.

Salesforce 2.3.14 source is
`5e01e73f9680cdf8885951b641e20ebad023a0c3`, immutable tag
`salesforce/v2.3.14`, archive SHA256
`ba5425193e23791a394ef1e0cac34ae9252e66a8e7ef7ebcd8ade8258a980718`.
All 102 installed plugin files on the MacBook match its immutable manifest.
The separate plugin publication receipt remains authoritative:
[salesforce-2314-publication-20261019.md](salesforce-2314-publication-20261019.md).

The normal release npm job failed with out-of-memory errors while packing
Terraform generation cache. Exact-tag recovery through
[backfill run 39309931133](https://github.com/f5-sales-demo/xcsh/actions/runs/39309931133)
succeeded; the original failed run remains historical evidence. Registry version
23.9.2 and `latest` both resolve to the immutable source above. The downloaded
npm tarball passed SHA512 integrity and SHA1 verification; SHA256:
`f677f5ecbebea3fed696f1c5de15d85f2a2582d4577d5e89690b95d5f828585a`.
It contains 1169 files, 156416485 unpacked bytes, and only the qualified
compressed SQLite asset in the Terraform generated directory. Generation inputs
and the uncompressed SQLite cache are absent. The root packaging regression is
tracked independently in [xcsh #5034](https://github.com/f5-sales-demo/xcsh/issues/5034).

## Installed fixture rendering

Individual automated inspection passed 780 final frames over 13 cases at
40/76/120/153/157 columns, collapsed/expanded, both themes, and
Unicode/ASCII/Nerd presets. All expected identifiers are unique. Exactly 390
collapsed frames show the new `Ctrl+O for details` cue; no final frame uses
`Ctrl+O for more`. Expanded frames each contain exactly one shared Arguments
section, and no synthetic secret sentinel appears.

Bash and Zsh reconstructed each declared command argv exactly using a synthetic
argv recorder. Literal shell metacharacters and Unicode, monetary grouping,
separate currencies, zero, false, empty text, empty and partial query results,
unavailable org state, and corrective query guidance passed. All 13 executions
had zero post-end repaints; the synthetic pipeline repainted 12 times during
execution.

A pane-layout change invalidated 94 final frames during the initial inspection.
Those frames and the failed journal were preserved privately; fresh frames at
the corrected allocation replaced them. Only the zero-failure final inspection
qualifies this receipt. Reused-buffer viewport snapshots do not establish
scroll acceptance; explicit page observations are recorded separately below.

Explicit controls and independent Herdr observations passed all 1122 fixture
viewport pages, with zero failures.

## Default information review

The fixture ranges include framing and line wrapping, rather than percentages
of data hidden.

| Tool/case | Collapsed lines | Expanded lines |
| --- | --- | --- |
| Org display | 8–9 | 45–53 |
| Describe | 38–75 | 424–480 |
| Pipeline | 70–99 | 1206–1633 |
| Exec | 11–15 | 31–39 |
| Help | 13–15 | 37–43 |
| Query zero | 11–15 | 56–62 |
| Query monetary fixture | 186–226 | 807–1069 |

Org displays connection, alias, username, instance and environment when supplied.
Additional safe identity metadata remains expanded. Describe shows standard
field previews, counts of standard/custom fields and child relationships, and
an explicit omission hint; `match` searches fields and relationships. Query
and pipeline tables retain twelve-row previews, with overflow counts. Pipeline
scope, currency-separated business summaries and actionable warnings remain
visible. Help preserves usage, required inputs, optional flags and examples;
exec presents decoded domain results before expanded technical evidence.

The review supports retaining these defaults. A targeted custom-field preview
or an additional org identity field could be evaluated against a concrete
workflow later; wholesale expansion is not supported by this evidence.

## Read-only MacBook service

All six tools completed scoped read-only service examples on the corporate MDM
MacBook through the published binary and installed plugin. Individual automated
inspection passed 360 final frames at 40/76/120/153/157 columns, both themes,
Unicode/ASCII/Nerd presets, collapsed and expanded. All 180 collapsed frames
use the new details cue; expanded frames have exactly one Arguments section.
Bash and Zsh command reconstruction passed. A synthetic argv-recorder timeout
was preserved privately and passed an isolated retry before final inspection.

Independent viewport comparison passed 372 page observations with zero failures.
Views up to 5000 lines were inspected page by page; longer live describe/pipeline
views sampled the first, middle and final pages. Complete native buffers are
retained privately, with lossless compression to avoid repeating very large
service results for every page. This is sampled live scroll evidence, not an
exhaustive inspection of every long service viewport.

The live pipeline recorded 351 repaints during execution. All six live executions
recorded zero repaints after completion. The separately installed published npm
23.9.2 module registered all six tools, reviewed the existing login-only setup
without executing it, reported integration state `ready`, and passed read-only
org display. No setup, authentication repair or service write ran.

## Actual interactive lifecycle

The actual installed TUI and plugin passed all five synthetic-service scenarios:
completion, cancellation, active context replacement, active shutdown and idle
shutdown. Each ended with zero active tools, zero late updates and exit code 0.
Cancellation, replacement and active shutdown each preserve an initial timing
attempt that completed naturally; their second execution records the action
while a synthetic service delay was active. Only that second execution qualifies
the active action. Delayed-update observation extends at least 21 seconds after
the final synthetic delay began.

| Scenario | Tool starts/ends | Tool updates | Final event SHA256 |
| --- | --- | --- | --- |
| Completion | 1/1 | 12 | `45787a2df78ebb28088e0ef34aaa6dca39279c9a6d04ff46adc7b4b0d952675b` |
| Cancellation | 2/2 | 10 | `1efa70b5f74dccf17b135def358fba8f30a80d3e51c60ed3a06b45ae03744e54` |
| Context replacement | 2/2 | 10 | `2ae47473fea81146b3917f369954f5f64d37574c05e24bc2e6d88e79fb969690` |
| Active shutdown | 2/2 | 10 | `118fd2eff39ca183aa8b361ad0ad4aa99908a27b01d6961899cd96f8574faa2a` |
| Idle shutdown | 0/0 | 0 | `b522673527101b85acfe811005396682564ac4328664721f6dee0bea882d4a96` |

Validation checkpoint hashes remain verified exact prefixes of the final event
files. Theme/preset changes and orderly shutdown appended events after some
checkpoints; the table records final-file hashes. Event update evidence does
not establish timer repaint behavior; native repaint evidence remains separate.

## Source validation and boundaries

Focused source checks passed 17 tests with 3057 assertions on repository-pinned
Bun 1.4.2: Salesforce workflows, tracker, renderer ownership and inventory.
That harness declares runtime 23.8.0; it is separate from the installed 23.9.2
qualification. The catalog contains 23 plugins, 324 current surfaces and 2757
tasks. Historical receipts and the canonical Retired surfaces appendix remain
preserved.

Raw captures, service results, argv records and lifecycle logs remain private.
No Salesforce writes or authentication repair were performed. Native ANSI
buffers and Herdr viewport observations do not establish desktop-font raster
fidelity or broader model tool selection. Other Salesforce content and
lifecycle gates remain independent in the canonical tracker; parent issues
Issues #1591 and #1624 remain open.

All owned fixture, live and five interactive capture panes have shut down and
closed normally; the unrelated working pane remains. Private captures and
historical failed cohorts are retained. Qualification and packaging delivery
worktrees remain until their respective PRs merge.

The six tools' capture/default/layout/fidelity/expansion/installed-example gates
are supported by this receipt. Full empty/unavailable/partial/failed matrices
for every tool, non-tool content workflows, desktop-font observation and broader
model-selection evidence remain unfinished; do not infer them from the six
read-only examples. The canonical tracker preserves exact next actions.

## Private evidence integrity

| Summary | SHA256 |
| --- | --- |

| fixture-2.3.14-23.9.2/inspection-summary.json | `613006c79e8a1a5678cfb46dcf0bc4a1c92941c7047e6492d2ebf7c0a4f95cd1` |
| fixture-2.3.14-23.9.2/final-frame-audit.json | `f95f4881dd7e3819d345d74fef1c0cc1f5e6ea42e351da3a6fe0a428c62f65db` |
| fixture-2.3.14-23.9.2/surface-summary.json | `24e9cc6d3a9f32fca84aaf1cc192f14c6a4684cb5588023298d2675c3580bf8b` |
| live-2.3.14-23.9.2/inspection-summary.json | `ed07d8e4e25fd4825e8290f23d77e4962cb44d3e17406859682b5d410d5268dc` |
| live-2.3.14-23.9.2/final-frame-audit.json | `48b3cde45a8bbffd23ff560fccbb68b9e2a27278b2c885177ecd8c8e8430ea32` |
| live-2.3.14-23.9.2/surface-summary.json | `32b2299794d23aa274f259142881da0fab841b831eced0a891ba5622329389c0` |
| runtime-23.9.2/interactive-final-integrity.json | `910010f0febcf86ed53af8269e5a86c52b927507c135c5e00b5e1f8d404dcc91` |
| runtime-23.9.2/npm-artifact-verification.json | `1fda28e209930a7a4016ede45dcbad45e65324c594c795f85fd9ff6e9cffdfd2` |
| runtime-23.9.2/npm-installed-module-acceptance.json | `aa342e1ecde0399614446222f4c749d443eb968e9ebc322764f26f952bacf074` |
