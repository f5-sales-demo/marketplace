# AWS stable runtime native viewport qualification

Campaign: [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Delivery: [#1811](https://github.com/f5-sales-demo/marketplace/issues/1811).
The [historical AWS and Azure receipt](aws-azure-1682-installed-native-20261020.md)
remains unchanged.

## Candidate and immutable binding

Both hosts qualified installed AWS 2.3.2 using the published stable xcsh 23.9.5
binary. The stable release was independently checked as `v23.9.5`, neither draft
nor prerelease. This candidate does not replace either host's default xcsh 23.9.3.
Discovery and AWS's declared minimum-runtime lane remain 23.8.0.

Tag `aws/v2.3.2` still resolves to source
`1876a73954031ce140ccb3aeceedab24b259c3d8`.
Each host rehashed its independently downloaded archive, compared all 76 AWS
files with Git source and its current installed cache, and bound the capture's
runtime executable to the verified binary digest.

| Artifact | SHA256 |
| --- | --- |
| AWS archive | 38c41cdf55ac233e155ec277d0778c0e60242725607653ca74df14dd290d6a84 |
| Mac runtime 23.9.5 | 0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e |
| Ubuntu runtime 23.9.5 | be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2 |
| Synthetic fixtures | 81622178ac9cbcf14c331335a10a7d11467ad307877cfd2517dae5e1ced8724a |
| Final evidence-once expectations | c90429c5d652a6b3cbdd8650838663e7b40774df2c9d189dcad2da0d913125b1 |

## Individual buffer and viewport inspection

The published binary's actual `ToolExecutionComponent` renders the installed
adapters with the existing 16 synthetic cases covering 11 native tools. Every
case covers 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd: 48 combinations. Fixture mode denies tool execution.

| Host | Native buffers | Viewport pages | Final failures | Terminal columns and rows |
| --- | --- | --- | --- | --- |
| Mac | 768 | 816 | 0 | 159 by 51 |
| Ubuntu workstation | 768 | 816 | 0 | 159 by 51 |

Both terminals use task-owned tabs on the managed Mac Herdr server. The Ubuntu
runtime runs through SSH inside its owned Herdr pane; existing remote Herdr
sessions are untouched. All matrix widths fit the observed terminal columns.

Each complete buffer is inspected for expected outcomes, width, bounded literal
values, unsafe evidence and evidence duplication. Every emitted viewport page
is then compared with the complete buffer at its actual clamped offset. Final
pages can overlap earlier pages; overlap must agree before reconstruction
removes duplicate rows. The reconstructed rows must equal the original buffer
exactly. Missing pages, duplicated pages, altered overlaps, changed dimensions
and inconsistent visible rows fail the inspector's behavioral regressions.

The fixture driver preserves all buffers and pages before sending `finish`.
The independent inspector rechecks every matrix identity and the stronger
historical evidence-once expectations. Reinspect preserved captures with a
fresh output name:

```sh
bun scripts/inspect-marketplace-viewport.ts PRIVATE_ROOT NEW_NAME PRIVATE_EXPECTATIONS_JSON
```

Each journal records one `capture_closed` and one `session_shutdown` after the
capture command and explicit exit. Both owned panes returned to their shell
prompts. This proves capture-session closure; plugin progress timers and
cancellation behavior require their own scenarios.

Private evidence identifiers are `aws-1811-stable-darwin-20261021` and
`aws-1811-stable-linux-20261021`. They retain original fixtures, expectations,
frames, viewport inspections, immutable bindings and journals. Failed tooling
attempt logs remain private alongside the capture evidence. Raw evidence is
excluded from publication.

## Acceptance boundaries

This delivery refreshes the eleven native tool capture gates on stable 23.9.5.
Viewport reconstruction adds evidence to their layout work without completing
physical or raster inspection, Bash/Zsh argv reconstruction, all outcome
scenarios, progress advancement, or executed shipped workflows. Theme and
preset controls change in the running capture session and reuse runtime
components; live progress behavior remains a separate gate.

No cloud command, authentication, setup, installation, service startup or
infrastructure mutation ran. Account-dependent service qualification is deferred
by the user. Resume only when the credential owner provides working credentials
and authorizes fresh, scoped reads. Salesforce evidence and retirement records
remain unchanged, and campaign #1579 stays open.
