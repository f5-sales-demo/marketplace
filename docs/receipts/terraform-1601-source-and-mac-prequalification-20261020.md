# Terraform lifecycle repair and Mac prequalification

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Child issue: [1601](https://github.com/f5-sales-demo/marketplace/issues/1601).

Implementation source: `b0cbb176b1720b54abdc1a4c4820ad058a2ea068`.
Terraform manifests are synchronized at 2.3.1. This source is locally committed;
publication, Ubuntu verification and installed acceptance remain pending. The
installed observations below exercised the previous 2.3.0 payload and do not
qualify the changed payload.

## Missing executable repair

With the normal installed CLI and a PATH containing only system utilities,
`xcsh plugin status terraform` reported `terraform: error (invalid_response)`.
An independent Bun probe confirmed that a missing executable throws `ENOENT`.
The first regression run failed exactly the missing-executable case: two tests
passed and one failed. That original failure remains private.

The repaired adapter maps only `ENOENT` to `setup_required` with reason
`cli_missing`. Unexpected permission errors, null and string exceptions propagate
unchanged. Existing nonzero-exit behavior and the exact `terraform version` argv
are preserved. The three regressions pass with seven assertions and are included
in the normal marketplace integration test runner. No imperative rendering or
runtime presentation controls were added.

## Resource-free shipped testing example

The testing skill now discloses that a native test run defaults to apply unless
it explicitly selects plan. It supplies a complete Bash fixture with no resources,
providers or remote backend. Its commands run in a clean environment with an empty
CLI config and checkpoint lookup disabled. The fixture explicitly chooses plan
and asserts preservation of zero, false and the empty string.

The exact source fence passed independently through Bash and Zsh on Mac using
Terraform 1.16.6, darwin arm64: formatting passed, initialization completed,
validation succeeded and the single plan test passed. This is direct source
workflow evidence, separate from a model executing the published installed skill.
The temporary fixture directories were removed by their exit traps. No cloud
account, infrastructure deployment, state unlock or setup installation was used.

Exact Bash fence SHA-256:
`0dcb6609b7bfc383c68fc0522f6fc307f3bd796fea59449228c150d44a7e9169`.

## Installed 2.3.0 lifecycle observation

The scoped stable runtime was 23.9.5 on Mac arm64. Binary SHA-256:
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
Normal CLI status reported ready. Normal TUI `/plugin setup terraform` dispatched
the literal `terraform: ready (setup is not required)` and skipped setup.

The existing public lifecycle observer selected the actual already dispatched
component. All 48 appearance buffers passed width, complete literal, single
identity/result and complete viewport checks at 40/76/120/153 columns, both themes
and Unicode/ASCII/Nerd presets. Expansion is not exposed by this component;
collapsed and expanded requests rendered the same result. Tools were disabled;
none occurred. Capture closure and session shutdown were journaled.

| Private audit | SHA-256 |
| --- | --- |
| workflow-frame-audit.json | `f45d14c72f245fa98fe19e05b145878d8f7913e69d1e16fed6e8cfa7bdb93260` |
| lifecycle-semantic-audit.json | `7791794755ebc906b5a5277bcb59824b4011ee6b246f4777ac551160f6fec8c1` |

## Installed 2.3.0 shipped guidance observation

The guarded workflow admitted exactly three full-file reads, one for each
installed Terraform skill, with exact full selector and timeout arguments. No
other tool was called or denied. Each returned numbered source line matched the
installed file completely. The model summarized the skills and identified
commands requiring separately reviewed execution scenarios; it executed none.

The real published `ToolExecutionComponent` rendered 144 appearance buffers. An
initial literal checker reported six failures where `terraform force-unlock`
wrapped across rows at 40 columns. Those failures remain preserved. Independent
inspection joined only continuations within their original numbered source line,
checked every visible line against the source, and checked full expanded line
coverage. All 144 passed. Pagination reconstructed every complete buffer through
828 viewport pages, with width and offset checks passing.

| Private audit | SHA-256 |
| --- | --- |
| numbered-guidance-audit.json | `73981ecf82e47c803e0f7d049ab72cb0e03c8624b47c479c512c3f0dde88c268` |
| pagination-audit.json | `8315a4870fc991e7a6a52f0da416603aa8b8d87458ea80d7b79ea37145a336c0` |

The task session exited normally and its pane returned to the shell. Private
evidence identifiers are `terraform1601-lifecycle-mac-20261020` and
`terraform1601-guidance-mac-20261020`. Raw captures and local identities remain
private. These observations establish a baseline for 2.3.0 only.

## Verification and remaining gates

The final focused source suite passed 94 tests with 1,258 assertions across
inventory, Terraform lifecycle, integration lifecycle, tracker, ownership and
qualification. The published discovery presentation suite passed 25 tests with
21,848 assertions. Manifest validation, generated catalog check, Bash syntax,
configured pre-commit hooks including textlint and secrets detection, and staged
PII enforce/audit checks passed. An initial Biome formatting failure was corrected
and retained privately.

The isolated full Mac runner reached all plugins and failed in KVM, Xorg and
Zoom. KVM initially used an incorrect Python dependency path; its independent
rerun with the actual Python 3.15 dependency directory passed all seven shell
checks and the Python cases. The original full-run failure remains preserved and
the full suite is not claimed green. Xorg's Mac fixture assumes `gsettings`;
Zoom's fixtures encounter Ubuntu platform guards and Mac temporary-path
canonicalization differences. Those failures require focused follow-up and Ubuntu
verification. The hermetic suite passed 354 tests and 2,394 assertions, with no
plugin test requiring a real cloud CLI.

At the declared minimum 23.5.1, the published `IntegrationRegistry` accepted the
changed Terraform integration and its unchanged verification plan. Four injected
subprocess cases passed: zero exit, nonzero exit, missing executable and permission
failure. Every case retained exact `terraform version` argv; the registry maps the
unexpected permission failure to its normal `error/invalid_response` result.
This is minimum-registry compatibility evidence, not installed acceptance. The
full extension-loader attempt failed because its isolated dependency tree lacked
`@tobilu/qmd`; that failure remains private and full-loader compatibility remains
pending.

| Private minimum audit | SHA-256 |
| --- | --- |
| minimum-check source | `e41998692e8ae0ba5440336563dda208e6aa2030719c176af20ea10e0443be7c` |
| minimum-registry result | `d8723029fa4890d6075fcab2f4650769535529f9d7b71ed7c617424ba5722041` |

Tracker reconciliation preserves discovery 23.8.0, 22 plugins, 314 surfaces,
2,670 tasks, Salesforce qualification and all historical receipts. Changing the
Terraform payload invalidates its fingerprint and all four shared fingerprints;
those gates remain open for current cross-host evidence. No 2.3.0 capture is
promoted to 2.3.1 acceptance.

The required Ubuntu SSH route repeatedly timed out. Next action: restore the
existing route, verify remote host/user/repository/branch identity, transfer this
issue-owned branch, run the complete Ubuntu suite and minimum-runtime lane, then
push a linked green PR through Ubuntu. After merge, independently verify the
immutable 2.3.1 artifact and installed payload on both hosts, repeat lifecycle and
guidance captures, and execute the exact shipped safe fixture under the guarded
model workflow. Requalify shared gates using current evidence. Campaign 1579 and
Terraform child 1601 remain open.
