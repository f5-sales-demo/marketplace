# Salesforce guidance and status qualification, 2026-10-19

Round: [#1655](https://github.com/f5-sales-demo/marketplace/issues/1655).
Parents [#1591](https://github.com/f5-sales-demo/marketplace/issues/1591) and
[#1624](https://github.com/f5-sales-demo/marketplace/issues/1624) remain open.

## Artifact and installed gates

Salesforce 2.3.14 production content is unchanged. All 43 installed source,
agent, skill and manifest files match source at
`5f9f6d79ad1f6486f073e8930594b9ae62798333`. This round changes acceptance tools
and receipts, so no production plugin patch or release is required.

The current official macOS ARM runtime is 23.9.3, published on 2026-10-19.
Acceptance used the extracted official binary in a private installation;
the global Homebrew runtime remained 23.9.2. Source compare against 23.9.2
changed packaging/version/lock files only. Source head is
`e0b6af534f1b08d0b0736aef9a3259111eed66c5`. The status source blob is
`83e2238c16a6950c6c2b4c46faa449362340cccd`.

| Artifact | SHA256 |
| --- | --- |
| macOS ARM ZIP | `c8a9f37df97b53df25cf024195d07f59e2e8bf51212241cd73e157297b3b578b` |
| Provenance | `f5fab41c3910401311c33f4937ac7288f4bce5390cf9f80b990f9beba7a28008` |
| Executable | `2471d03be69b66adcc213a607151afc951830cc3cb9949bc206ca975f5fa173d` |
| Native addon | `617db65240b27fd267e3a769ef9e4f9f630374d62af4ba3a96aafebb8a4eb77c` |

Artifact digests matched the release. Strict codesign verification passed;
provenance identifies hardened/notarized Apple team `97ZYL78T5F`.
Historical 23.9.2 receipts remain retained and scoped to their original inputs.

## Interactive service and guidance gates

Only the corporate MDM MacBook executed read-only service tools. The observer
loaded the installed plugin and wrapped its registration; the runtime invoked
lifecycle handlers normally. The observer denied shell, delegation, setup,
login, write tools and unscoped file reads. It admitted shipped guidance reads
and typed read-only Salesforce tools. No credentials were repaired.

Four actual model turns completed with UI enabled and zero blocked attempts:

1. Read shipped cli-operator, then checked the default org.
2. Read shipped salesforce-index, then executed the exact null-ID aggregate
   query. The answer distinguished a zero filtered count from an org-wide total
   and from the one aggregate result row.
3. Executed the default pipeline report and explained scope, currencies and
   missing prerequisites without inventing complete figures.
4. Interpreted the preceding result without more tools. After the pipeline,
   the runtime dispatched `salesforce_hint` with `display=false`; the next
   model context contained one hint. The visible answer retained limitations
   without displaying the hidden message payload.

The cli-operator answer truthfully reported the native tool invocation but
could not verify underlying CLI argv from model result evidence. This leaves
cli-operator fidelity/acceptance blocked. The concrete repair is
[#1656](https://github.com/f5-sales-demo/marketplace/issues/1656): expose safe
executed command evidence and align guidance, then publish/install and repeat
those gates. Native shared-renderer command-copy receipts remain separate.

## Synthetic unavailable and outcome gates

Four additional actual model turns used an isolated synthetic Salesforce CLI
before the normal PATH. They read the unchanged shipped guidance. The answers
explained missing org authorization, invalid-field failure and schema repair,
empty filtered records, and incomplete pagination independently. The partial
answer also detected fixture names inconsistent with the requested filter.
It did not infer an org-wide total or execute export, login, setup or writes.
These are fixture outcomes, not live authentication acceptance.

## Presentation inspection

Actual completed tool results and assistant messages were rendered through
published `ToolExecutionComponent` and `AssistantMessageComponent` in the
running native UI. Each case was checked at 40/76/120/153 columns,
collapsed/expanded, both themes, and Unicode/ASCII/Nerd presets.

The live matrix has 336 passing frames; the fixture matrix has 576 passing
frames. The fixture viewport audit completed with 1,307 passing pages and zero
failures. Its pane grew during capture; this is evidence of each observed page,
not a stable-geometry live audit. The original live audit had 48 false overflow failures because the
checker counted invisible OSC 8 hyperlink destinations. A failing regression
established the cause; the repair ignores BEL/ST-terminated control metadata
while preserving visible labels and genuine overflow. The failed audit remains
private. Terminal viewport receipts independently inspect expanded pages. The live scroll
audit remains incomplete: ENOSPC interrupted it, and a subsequent pane split
changed viewport geometry during resumption. Those failed/interrupted receipts
are retained; guidance layout/expansion/live gates remain BLOCKED until a
serial audit completes with stable pane geometry.

During scroll capture, repeated full pipeline evidence filled the Mac disk.
The driver was stopped, raw frames were retained with verified lossless
compression, and 30 large frames were retained privately on Ubuntu with digest
verification. No Ubuntu service probe occurred. Scroll captures now store only
the viewport and support resuming already inspected pages. The ENOSPC failure
remains private; it does not count as a passing capture.

## Published status surface

`xcsh plugin status salesforce` on the official 23.9.3 binary returned
`salesforce: ready`. A native terminal diagnostic at 40/76/120/153 columns
showed the same 17-cell text at every width. The 40- and 153-column processes
exited successfully; the 76- and 120-column processes exceeded the timeout and
required termination. Status layout acceptance remains BLOCKED until all
widths complete successfully; visible text alone does not close this gate.
The published handler prints plain state/reason/next-action
text and strips the credential-bearing `value` from JSON status. It has no
expansion, theme or symbol-preset presentation controls. Expansion/live
appearance gates are NOT APPLICABLE for this exact CLI surface, with source
reason; this does not qualify the separate setup wizard or dashboard.

## Validation and limits

Focused observer tests pass (4 tests, 18 assertions); the native capture tests
pass including hyperlink metadata regression. Full plugin suites, catalog
validation, tracker/ownership, pinned Bun compatibility and cloud-CLI
hermeticity passed on Ubuntu. The full suite required the same isolated
PyYAML 6.0.3 dependency explicitly installed by CI. Initial missing-PyYAML and
wrong local Bun-version failures were retained, then resolved by the declared
test prerequisites. Pre-commit passed on changed scripts.

Raw sessions, commands, service values, org/user/account identities, messages
and terminal captures remain private. This receipt publishes only sanitized
outcomes and artifact/source provenance. ANSI/Herdr inspection does not
establish desktop-font raster fidelity. Auth/setup gates remain BLOCKED pending
a human-owned setup review in an isolated authorized context; existing ready
credentials must be preserved. Optional model delegation was not exercised.
