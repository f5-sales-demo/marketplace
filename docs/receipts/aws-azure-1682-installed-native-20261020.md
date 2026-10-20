# AWS and Azure installed native evidence

Campaign: [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Evidence delivery: [#1682](https://github.com/f5-sales-demo/marketplace/issues/1682).
Remaining qualification: [AWS #1675](https://github.com/f5-sales-demo/marketplace/issues/1675)
and [Azure #1681](https://github.com/f5-sales-demo/marketplace/issues/1681).
Historical source and installed receipts remain unchanged.

## Immutable artifact and installations

Independently downloaded tag archives, Git source and both installed plugin caches
match every tracked plugin file. Both hosts run stable xcsh 23.9.3. Mac resolves
`/opt/homebrew/Caskroom/xcsh/23.9.3/bin/xcsh`; Ubuntu resolves
`$HOME/.local/bin/xcsh`. Both plugins support these hosts.

| Plugin | Tag | Source commit | Files compared per host | Archive SHA256 |
| --- | --- | --- | --- | --- |
| AWS 2.3.2 | aws/v2.3.2 | 1876a73954031ce140ccb3aeceedab24b259c3d8 | 76 | 38c41cdf55ac233e155ec277d0778c0e60242725607653ca74df14dd290d6a84 |
| Azure 4.6.1 | azure/v4.6.1 | f5a0082a04bd6bcc23ee7b8c7b43838335e82b0f | 96 | 60307fd88a3680701f168f034999f8f28c79eedd80e6114351be2df93e58ffbc |

Private evidence identifiers: `aws-artifact-2.3.2-20261020` and
`azure-artifact-4.6.1-20261020`, under each host's private campaign root.
Archive digests and per-file comparisons are retained there.
The tracker installed metadata remains the historical starting inventory;
current installed qualification is recorded in these gate receipts.

## Installed native matrices

Each fixture uses the published binary's real `ToolExecutionComponent` and the
selected installed adapter. No fixture executes cloud commands. Every frame is
checked individually at 40/76/120/153 columns, collapsed/expanded, dark/light,
and Unicode/ASCII/Nerd: 48 combinations per case.

| Plugin | Cases | Registered tools | Frames per host | Final failures per host | Expectations SHA256 |
| --- | --- | --- | --- | --- | --- |
| AWS 2.3.2 | 16 | 11 | 768 | 0 | c90429c5d652a6b3cbdd8650838663e7b40774df2c9d189dcad2da0d913125b1 |
| Azure 4.6.1 | 20 | 15 | 960 | 0 | 9b55ebf71767aa308de57b40a44bc03f926cb4589fc3fdc300e155f4024566bd |

All 3,456 frames across both hosts pass the final bounded inspection. Assertions
cover expected outcomes, width, selected literal values, unsafe evidence and
exactly one expanded CE marker. Wrapped values are reconstructed only within
bold-labeled fields or individual table cells bounded by row rules. Unrelated
fields, rows, columns and unframed paragraphs are never concatenated. Forbidden
wrapped literals use the same bounded reconstruction. Occurrence assertions
count literal markers in the actual buffer; markers intentionally fit one line.

Original Azure findings remain private, including 66 Ubuntu literal-matching
failures caused by wrapping. Follow-up inspections append new files and preserve
all earlier findings. AWS's fresh failure fixture explicitly expects an error.
Final inspection files are `final-bounded-inspection.jsonl` and
`final-bounded-summary.json`. Reproduce without replacing historical evidence:

```sh
bun scripts/reinspect-marketplace-capture.ts PRIVATE_ROOT NEW_NAME PRIVATE_CHECKS_JSON
```

Private capture identifiers:

- `aws-installed-232-darwin-20261020`
- `aws-installed-232-linux-20261020`
- `azure-installed-461-mac-20261020`
- `azure-installed-461-ubuntu-20261020`

## Remaining gates

Native buffers establish installed tool capture gates. They do not establish
viewport/raster appearance, scroll/pagination behavior, exact Bash/Zsh command
execution, live theme/preset changes, progress advancement or timer cleanup.
Safe service and executed shipped guidance remain separate acceptance work.

Initial model identity scenarios admitted only exact `{}`. The model supplied
optional fields on both hosts, and both guards rejected the calls. Azure also
requires an explicit action in its tool schema. Neither attempt executed an
identity read. Private events retain the chosen arguments, rejection, result
and assistant conclusion. Fresh schema-valid exact scenarios are required;
these initial findings establish no credential or service failure.

Fresh schema-valid scenarios subsequently ran through normal model dispatch.
Azure on Mac admitted exactly `{"action":"show","subscription":""}`, returned
a successful current-account result and recorded the assistant conclusion.
AWS on Ubuntu admitted exactly `{"profile":""}` and returned `ExpiredToken`
with literal corrective guidance `Run: xcsh plugin setup aws`. Its error type
is `session_expired`. Credential-owner renewal and a fresh recapture are required
for that service lane. No authentication was attempted. Identity values and
complete assistant conclusions remain private under
`azure-identity-service-darwin-schema-20261020` and
`aws-identity-service-linux-schema-20261020`. One Azure identity read does not
finish either plugin's complete supported-host service or guidance gate.

The canonical tracker verifies only 26 tool capture IDs and four artifact/host
IDs from this evidence. Other gates remain unfinished with next actions.
Discovery/minimum inventory runtime remains 23.8.0; installed evidence uses
23.9.3. Salesforce qualification and retirement history are preserved.

Focused tooling, observer, tracker and ownership tests pass: 25 tests,
125 assertions. An added wrapped-forbidden-value regression failed before the
checker repair. Catalog reconciliation passes for 23 plugins, 324 surfaces and
2,757 tasks. Ubuntu CI-pinned Bun 1.4.2 full plugin suites, hermeticity and manifest/catalog
validation pass. The discovery/minimum graph remains pinned at 23.8.0.
Staged privacy enforcement, changed-file lint and green linked delivery remain
required before this evidence change completes.
