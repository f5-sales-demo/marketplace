# ASM Migration 2.3.2 offline module qualification

Campaign [1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
child [1600](https://github.com/f5-sales-demo/marketplace/issues/1600),
qualification [1733](https://github.com/f5-sales-demo/marketplace/issues/1733).

Mac arm64 and Ubuntu x64 each passed eleven installed validation and conversion
module cases against synthetic local files. All results and public presentation
views matched after replacing the private capture root. Complete conversions
produced identical artifacts on repeated execution and across hosts.

This is `installed-plugin-module` execution. It calls the installed registered
tool's `execute` method and public result adapter; it does not execute through
normal native dispatch or a model turn. The separate
[native fixture receipt](asm-migration-1729-fixtures-20261020.md) supplies the
384 buffers and 1,818 viewport pages per host across the full presentation matrix.
Together these receipts support validation and conversion default-summary and
fidelity gates. Actual native and shipped workflow acceptance remains unfinished.

## Provenance and restrictions

- Installed plugin: `asm-migration/v2.3.2`, immutable source
  `d659e5d74e3b424e35b62a6ea85b116029a0631b`.
- Archive SHA-256:
  `cd3b3d2fecd2d83d50cc3f5258dcf9169f23cca4c2cd60c3c7a13a3f8425f44e`.
  The [artifact receipt](asm-migration-1726-artifact-20261020.md) verifies all
  41 installed files on both hosts.
- Published runtime package: `@f5-sales-demo/xcsh@23.9.5`, installed privately
  with Bun 1.4.2 and scripts disabled. All 1,169 package files outside nested
  dependencies match across hosts; sorted relative-path/SHA-256 manifest digest:
  `8c934f72a0bd59eef5e9fb555db5a23e5730c1c3a36615caa47286a9cb7a9de7`.
- Qualification helper SHA-256:
  `d82cb5710292c16164d6c9905c4082543b10328cd3134fab6e9e55b70e0d931a`.
- Normalized eleven-result/view comparison SHA-256:
  `4c2bb53721965ebefc2894942d468dad77eeaadcb5cddfb5ca5b5b87da43cb21`.

The helper requires exact manifest/runtime versions and a fresh private output
root. It imports the actual installed extension factory, injects the published
public presentation and TypeBox APIs, and checks exactly three registered tools
with no imperative renderers. During execution, guards replace `fetch`,
`Bun.spawn` and `Bun.spawnSync` with rejecting counters. Both hosts recorded zero
attempts. Only validation and conversion were called; deployment was never called.
The guards establish these execution paths, rather than a general network sandbox.
No credentials, services or default installations were changed.

## Executed outcomes and evidence

| Case | Observed outcome |
| --- | --- |
| Valid policy | Valid, named policy identity and scope retained |
| Enabled unsupported policy feature | Validation retained the enabled `csrf` feature |
| Invalid config pack | Error status, invalid contract, one resource and zero validated resources retained |
| Malformed XML | Failure category and complete corrective guidance retained |
| Missing local file | File failure and complete corrective guidance retained |
| Complete conversion, twice | Complete, zero warnings, three resource kinds and four managed files |
| Existing output directory | Output error; overwrite protection retained |
| Strict unsupported conversion | Rejected enabled `csrf`; no output directory created |
| Explicit partial conversion | Complete false, blocking warning and literal partial-review guidance retained |
| Generated config pack | Valid against the pinned contract; all resources validated |

For every case, both collapsed and expanded adapters returned provided evidence.
Expanded sections exactly equaled public `presentation.data` for the complete
result details plus each original text block once. Collapsed output retained each
literal operator or corrective text block exactly once. Individual review confirmed
scope, completion, zero counts, false values, warning causes and next actions.
The existing native matrix separately verifies malformed fallback, empty and long
lists, pagination, live appearance and evidence occurrence counts.

Each conversion wrote exactly `config-pack.json`, `manifest.json`, `report.json`
and `warnings.json`. All eight complete/partial artifacts parsed as JSON.
Repeated complete conversions had identical SHA-256 values:

| File | Complete SHA-256 | Partial SHA-256 |
| --- | --- | --- |
| config-pack.json | f86b2d9dfd36f06ab57bb0f5ec4e29ba18fe3e0c63b6bd14ee0f0913f3ffe8bd | 3889df5fd07ab4d42f30962519faf206f33b8eda65fe26f2954bf82e22f2f5ff |
| manifest.json | ec75fc44816175f70f4e25566405374fd98f9bf953eab9af46b661e369606730 | 7e23f74a9c307ee94d3b43b7140f9440dffffef2d679ded4fe84a7970663f8f0 |
| report.json | b09e4cfb1af2b3605766a247e3ec1d92319a87928f6864b21e614728efd96de8 | 88dae50c5a9b2059f53b5d04b011009dac38dbd0f5d4b8aa0fbd87840b9e7201 |
| warnings.json | 37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570 | 8f66b3bb91c0679d1eabc7048761e85ba04240d5a3edc812c3d224ec32638a95 |

Raw inputs, results, views and helper remain private under identifiers
`asm1733-offline-module-mac-20261020-v4` and
`asm1733-offline-module-ubuntu-20261020-v4`. Two initial Mac attempts incorrectly
expected a non-error invalid contract; the fixture and expectation were repaired.
Those failed attempts remain private. The passing v3 attempts remain preserved;
v4 adds exact complete-evidence comparisons and separate result filenames so the
invalid input fixture cannot be overwritten by its result capture. No plugin
behavior change was needed.

## Verification and remaining gates

Both hosts passed the ASM suite: 63 tests and 1,284 assertions each. Foundation,
observer, ownership, qualification and catalog/tracker checks passed: 40 tests and
708 assertions each. The final Mac tracker/inventory lane passed ten tests and
495 assertions. Markdown, terminology, hygiene, spelling, secrets and staged
privacy enforcement/audit passed on both hosts. Exact row comparison confirmed
that only the four intended tracker lines changed; all other lines were retained.
No plugin payload, manifest, development pin or lock changed, so no plugin bump or
publication is required. Discovery remains 23.8.0; minimum-runtime compatibility
remains the separately qualified 23.5.1 lane.

Only defaults and fidelity for `asm_migration_validate` and
`asm_migration_convert` are requalified here; prior row receipts are preserved.
Offline normal native execution, shipped command/skill conclusions and remaining
outcome acceptance need their own safe executed evidence. Guidance qualification
[1722](https://github.com/f5-sales-demo/marketplace/issues/1722) has no recorded
model admission or result and remains separate. Account-dependent deployment
service qualification is deferred by the user. Campaign 1579 remains open.
