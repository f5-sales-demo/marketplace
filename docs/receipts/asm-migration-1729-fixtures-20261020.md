# ASM Migration 2.3.2 installed fixture qualification

Campaign [1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
child [1600](https://github.com/f5-sales-demo/marketplace/issues/1600),
qualification [1729](https://github.com/f5-sales-demo/marketplace/issues/1729).

Mac arm64 and Ubuntu x64 each passed 384 native tool buffers and 1,818 viewport
pages against the same eight reviewed synthetic results. This establishes
installed rendering, layout and expansion evidence for the three ASM tools.
Actual tool execution, shipped workflow conclusions, service acceptance and
physical readability remain separate gates.

## Provenance

- Plugin: `asm-migration/v2.3.2`, immutable source
  `d659e5d74e3b424e35b62a6ea85b116029a0631b`.
- Archive SHA-256:
  `cd3b3d2fecd2d83d50cc3f5258dcf9169f23cca4c2cd60c3c7a13a3f8425f44e`.
  The [artifact receipt](asm-migration-1726-artifact-20261020.md) independently
  verified all 41 source and installed files on both hosts.
- Runtime: `v23.9.5`, source `3fc47cd286894e4a73e06fc0259ff98601b8a68f`.
- Mac executable SHA-256:
  `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
- Ubuntu executable SHA-256:
  `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
  The [lifecycle receipt](asm-migration-1723-lifecycle-20261020.md) records
  independent runtime artifact and signature verification. Default installations
  were preserved.
- Observer SHA-256:
  `11478f794b9c61946cff6ba1a08165b380bea5764300723431344f7783fbf008`.
- Fixtures SHA-256:
  `f52946a3889dfe2a13fdef4e59f5d0a4f70139f990a2605bd9ccaa21059d0ad5`.
- Scenario `asm-installed-232-native-fixtures` SHA-256:
  `e1cdad2e607ed019edb78391955f124e89db5c5a325ff9aeb6cc2a43974a82e1`.

The scoped published executable loaded the installed plugin through
`scripts/observe-marketplace-campaign.ts`. Launch flags were `--no-extensions`,
`-e scripts/observe-marketplace-campaign.ts`, `--no-skills`, `--no-rules`,
`--no-memories`, `--no-lsp`, `--no-pty`, `--no-title` and a private session directory.
The reviewed environment selected the installed entrypoint, plugin name, private
scenario, fixture file and capture root, with `MARKETPLACE_CAMPAIGN_MODE=fixture`.
Normal `/marketplace-campaign-capture` dispatch created real published
`ToolExecutionComponent` instances. No model turn or tool execution occurred;
fixture mode guards reject both. This is synthetic result rendering through an
installed binary, not synthetic proof of executed acceptance.

## Individual inspection

Every case passed 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd: 48 combinations per case on each host. The eight cases were
policy validation, partial conversion, deployment plan, native error, empty
conversion, nineteen-row lists, malformed conversion and rollback.

Each buffer was independently inspected for width, identity, scope, consequential
warnings, zero and false, literal corrective guidance and expected occurrence
counts. Partial conversion retained remediation and the partial-review warning.
The empty result retained completeness and zero counts. Long lists preserved the
first twelve-row preview and all nineteen entries on expansion. Structured
expanded evidence appeared once; malformed output retained automatic fallback.
Native failures retained complete corrective guidance. No monetary values or
executable command-copy surface is exposed by these native tools; request scope
and effective flags are shown directly. Shipped command guidance remains separate.

Both terminals reported 160 columns and 11 rows, with nine viewport rows per
page. All 1,818 pages per host matched their full native buffer at the recorded
scroll offset. Stitching pages reconstructed each complete buffer exactly. Live
appearance changes used the running session's public theme and symbol APIs.
The private capture timer stopped on finish, followed by normal
`/marketplace-campaign-exit`, a shutdown event and return to the shell.

All 2,202 native buffers, including pages and recorded viewport dimensions,
matched across hosts after excluding host-specific provenance. Comparison SHA-256:
`e19497422ee535487766659755c5fab3e557f97e106229daa8f05e3304dbf1d1`.
The independently produced audit digests also matched:

| Audit | SHA-256 |
| --- | --- |
| 384 width and native frame checks | `36bc3f970cea9585f5ae4e5e59395c90219835e299dbcded0d0cf74f2baaf7d8` |
| 384 domain checks | `fd3f84f892ff3291c9e27cf719f4f2511eafb6c7acfded26349e08593ec7d6d1` |
| 1,818 pagination checks | `7e66f3973a79ee06b23d275925afff42729c3c067bab4a0fd9115bb6ea1df429` |

Raw frames, sessions and audit inputs remain private. Final identifiers are
`asm1729-installed-fixtures-mac-20261020-v2` and
`asm1729-installed-fixtures-ubuntu-20261020-v2`.

## Observer repair and verification

Failing behavioral regressions reproduced repeated Escape completing twice,
shutdown leaving a capture open and invalid scroll offsets being accepted. The
observer now closes idempotently, stops its timer on cancellation or shutdown,
rejects new captures after shutdown and discards awaited appearance updates that
return after closure. It rejects invalid scroll offsets and oversized frame IDs.
Four new regressions cover these failures and normal finish. Native rendering and
exact scenario admission remain intact. No plugin payload changed, so no plugin
version bump or republication is required.

Focused observer and qualification tests passed on both hosts: 28 tests and
202 assertions. The Ubuntu full marketplace suite and hermeticity checks passed.
ASM minimum runtime 23.5.1 passed 63 tests and 1,284 assertions. Development remains
23.9.4; discovery remains deliberately pinned to 23.8.0. Installed qualification
uses verified stable 23.9.5. Catalog, ownership and canonical tracker checks passed.

The original Mac capture was invalidated when a neighboring task-owned pane was
closed during capture, resizing the terminal. All 384 frames existed, but 176
failed terminal-width checks. That capture setup mistake and raw failed evidence
remain preserved under `asm1729-installed-fixtures-mac-20261020`; the fresh v2
capture passed without pane layout changes. Fresh-worktree dependency failures
in the initial verification attempts were retained; frozen installation restored
the required dependencies before the successful checks.

## Tracker scope and remaining gates

Only capture, layout and expansion for `asm_migration_validate`,
`asm_migration_convert` and `asm_migration_deploy`, plus `delivery.checks`, are
requalified here. Prior receipts remain in historical row notes. This receipt
does not promote fixtures into actual execution or complete outcome acceptance.

Guidance qualification [1722](https://github.com/f5-sales-demo/marketplace/issues/1722)
remains independently queued; no model turn or tool result is claimed. Offline
executed workflows, other surface gates and physical acceptance remain open.
Account-dependent service qualification remains deferred by the user. Its next
action is to qualify an existing authorized read-only scenario after deferral is
lifted; this campaign does not start services, set up accounts or deploy resources.
Child 1600 and umbrella 1579 remain open.
