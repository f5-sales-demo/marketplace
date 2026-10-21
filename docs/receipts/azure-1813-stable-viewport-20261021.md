# Azure stable runtime native viewport qualification

Campaign: [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Delivery: [#1813](https://github.com/f5-sales-demo/marketplace/issues/1813).
The [historical AWS and Azure receipt](aws-azure-1682-installed-native-20261020.md)
remains unchanged.

## Candidate and immutable binding

Both hosts qualified installed Azure 4.6.1 using the published stable xcsh 23.9.5
binary. The latest release was independently checked as `v23.9.5`, neither draft
nor prerelease. Default executables remain xcsh 23.9.3. Discovery and Azure's
declared minimum-runtime lane remain 23.8.0.

Tag `azure/v4.6.1` still resolves to source
`f5a0082a04bd6bcc23ee7b8c7b43838335e82b0f`.
Each host rehashed its independently downloaded archive and compared all 96
Azure files with Git source and its current installed cache. The capture's
resolved runtime executable matches the independently verified binary digest.

| Artifact | SHA256 |
| --- | --- |
| Azure archive | 60307fd88a3680701f168f034999f8f28c79eedd80e6114351be2df93e58ffbc |
| Mac runtime 23.9.5 | 0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e |
| Ubuntu runtime 23.9.5 | be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2 |
| Synthetic fixtures | 3981af0f3116e7c2e12410f9c662371df45033a1b2b185a563226204196e4e71 |
| Final evidence-once expectations | 9b55ebf71767aa308de57b40a44bc03f926cb4589fc3fdc300e155f4024566bd |

## Individual buffer and viewport inspection

The published binary's actual `ToolExecutionComponent` renders the installed
adapters with the preserved 20 synthetic cases covering all fifteen native
tools. Each case covers 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd: 48 combinations. Fixture mode denies tool execution.

| Host | Native buffers | Viewport pages | Final failures | Terminal columns and rows |
| --- | --- | --- | --- | --- |
| Mac | 960 | 1,188 | 0 | 159 by 51 |
| Ubuntu workstation | 960 | 1,188 | 0 | 159 by 51 |

Both terminals use task-owned tabs on the managed Mac Herdr server. Ubuntu runs
through SSH inside its owned Herdr pane. All matrix widths fit the observed
terminal columns.

Each buffer is inspected for its expected outcome, width, literal values,
unsafe evidence and evidence duplication. This includes subscription identity
and `false`, twelve-row previews and final expanded rows, pagination guidance,
opaque output, empty and malformed results, literal failed-command guidance,
long keys and CE evidence once. These cases retain the historical expectations.

Every emitted viewport page is compared with the original buffer at its actual
clamped offset. Overlapping final pages must agree before reconstruction removes
duplicate rows. The reconstructed rows must equal the complete buffer exactly.
An independent offline pass rechecks every identity and viewport page against
the stronger evidence-once expectations, with zero failures on both hosts.

The viewport inspector is bound to revision
`ab4bb6ca285d2171ed774486b83357e67db44c13` in [#1812](https://github.com/f5-sales-demo/marketplace/pull/1812).
That PR was awaiting required CI during qualification; its shared tooling
delivery remains a dependency. This receipt does not complete any shared gate.
After its merge, inspect preserved captures with a fresh output name:

```sh
bun scripts/inspect-marketplace-viewport.ts PRIVATE_ROOT NEW_NAME PRIVATE_EXPECTATIONS_JSON
```

Each journal records exactly one `capture_closed` and one `session_shutdown`.
Both owned panes returned to their shell prompts, confirmed by foreground
process inspection. No tool execution was observed. Capture-session closure
does not establish plugin progress advancement or cancellation behavior.

Private evidence identifiers are `azure-1813-stable-darwin-20261021` and
`azure-1813-stable-linux-20261021`. They retain fixtures, expectations, frames,
viewport inspections, immutable bindings, ownership records and journals.
Failed preparation and tooling logs remain private alongside this evidence.

## Verification and acceptance boundaries

Both hosts passed 59 focused ownership, observer, lifecycle, qualification,
tracker and inventory tests with 813 assertions. Azure's declared 23.8.0
minimum-runtime tests passed on each host: 284 tests and 701 assertions.

This refreshes the fifteen native tool capture gates on stable 23.9.5. Viewport
reconstruction adds evidence to their layout work without completing physical
or raster inspection, native Bash/Zsh argv reconstruction, every outcome,
progress advancement or executed shipped workflows. Runtime theme and preset
controls change within the running capture session; live progress behavior
requires its own scenario.

Account-dependent qualification remains deferred by the user. Resume service
gates only after the credential owner supplies working credentials and fresh,
scoped reads are authorized. Salesforce evidence, fingerprints and retirement
records remain unchanged. Campaign #1579 stays open.
