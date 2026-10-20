# ASM Migration 2.3.2 installed lifecycle capture

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Qualification: [1723](https://github.com/f5-sales-demo/marketplace/issues/1723).
Plugin implementation: [1725](https://github.com/f5-sales-demo/marketplace/pull/1725).

ASM Migration 2.3.2 normal CLI status and normal TUI ready setup skip were captured
on Mac arm64 and Ubuntu x64 using independently verified runtime 23.9.5. Each
host passed 48 appearance frames. These results establish current lifecycle
captures, not complete plugin or campaign acceptance.

## Immutable and installed provenance

- Plugin tag: `asm-migration/v2.3.2`; source
  `d659e5d74e3b424e35b62a6ea85b116029a0631b`.
- Plugin archive SHA-256:
  `cd3b3d2fecd2d83d50cc3f5258dcf9169f23cca4c2cd60c3c7a13a3f8425f44e`.
  [Independent artifact receipt](asm-migration-1726-artifact-20261020.md)
  records all 41 source and installed files matching on both hosts.
- Runtime tag: `v23.9.5`; immutable source
  `3fc47cd286894e4a73e06fc0259ff98601b8a68f`.
- Mac binary SHA-256:
  `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
- Ubuntu binary SHA-256:
  `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
- Scoped qualification executables on both hosts returned `xcsh/23.9.5` and
  matched freshly downloaded release assets byte for byte. Native addons,
  release API digests, immutable tag source and published provenance were checked
  independently. Mac signatures passed strict verification, including the
  hardened runtime and signing timestamp. The default installations were retained.
- [Runtime publication workflow](https://github.com/f5-sales-demo/xcsh/actions/runs/39431858942)
  finished green after the direct MDM x64 job was retried. Its first attempt failed
  at Apple ticket lookup with a lost CloudKit connection; that private log remains
  preserved separately. Both direct MDM lanes passed on the final run.

## Normal dispatch and visible result

Normal CLI invocations were `xcsh plugin status asm-migration` and
`xcsh plugin status asm-migration --json`, using the scoped executables.
Text reported `asm-migration: ready`. JSON identified integration `asm_migration`,
name `ASM Migration`, plugin `asm-migration` and state `ready`.

The TUI loaded the actual installed plugin entrypoint and the qualification
observer. Normal `/plugin setup asm-migration` dispatch emitted exactly:

```text
asm-migration: ready (setup is not required)
```

Final capture harness SHA-256:
`ad8cb59b171a3a54e6fea9512a36790603050970039506128ed712bff1e67728`.
Selector SHA-256:
`6914b41de99076ea613c2e6d91449dcd48b4842700560360c569b6104715ef75`.

The observer used public `ctx.ui.custom` and the actual TUI component tree. It
selected the deepest unique already dispatched component by its literal result,
then called that same object's public `invalidate` and `render` methods. It did
not import private runtime components, identify private classes, call lifecycle
handlers manually or manufacture lifecycle text. The selection refuses missing,
duplicate and malformed results. Model tools were disabled and every model tool
call was guarded; none occurred in either installed capture.

At 40 columns, the ASCII result was:

```text
+--- Plugins --------------------------+
| asm-migration: ready (setup is not   |
| required)                            |
+--------------------------------------+
```

## Individual matrix inspection

Each host exercised 40/76/120/153 columns, both themes and Unicode/ASCII/Nerd
presets with both collapsed and expanded requests: 48 frames per host. Each frame
was checked independently for nonempty output, width fit, complete literal result,
a single identity/result occurrence and viewport fit. All 96 passed. Appearance
changes used the running session's public theme and symbol APIs.

The dispatched lifecycle component exposes no expansion setter. Collapsed and
expanded requests therefore yielded identical output; this is recorded as
`not-exposed-by-public-component`, not proof of a toggled expansion state. CLI
status likewise has no expansion control. No pagination, monetary values, lists
or executable command-copy surface appeared in these ready results.

Both terminals exposed 160 columns and 11 rows during capture. The complete result
fit the recorded viewport. This verifies public component buffers and viewport
capacity; physical font/readability acceptance is separate.

Private final evidence identifiers are
`asm1723-public-lifecycle-mac-20261020-v3` and
`asm1723-public-lifecycle-ubuntu-20261020-v3`. Preliminary captures and the failed
non-PTY launch were retained. Raw evidence and local identities stay private.

| Private audit file | SHA-256, identical on both hosts |
| --- | --- |
| workflow-frame-audit.json | `f45d14c72f245fa98fe19e05b145878d8f7913e69d1e16fed6e8cfa7bdb93260` |
| lifecycle-semantic-audit.json | `d0328458393bf31dce26329eaa2ce08a49cc83f3fdebb7a5b60f0bed782e6c3f` |

## Guard, cleanup and verification

The harness now rejects missing/invalid frame IDs and invalid scroll offsets.
Cancellation is idempotent; pending appearance updates cannot write late frames
or acknowledgements after closure or shutdown. Tests first reproduced missing-ID
acceptance and repeated closure, then passed after correction. Normal finish and
session shutdown were journaled on both hosts; the task pane returned to its
local shell with the original terminal size restored.

Commands used for focused verification:

```sh
bun test scripts/observed-lifecycle-component.test.ts scripts/observe-marketplace-lifecycle.test.ts
bun test tests/presentation-tracker.test.ts tests/presentation-ownership.test.ts tests/marketplace-qualification.test.ts tests/marketplace-observer.test.ts
python3 scripts/drive-salesforce-campaign-frames.py "$PRIVATE_CAPTURE_ROOT"
```

The seven harness tests passed with 20 assertions. The combined focused Mac suite
passed 41 tests with 236 assertions. The normal marketplace runner includes the
new tests. Existing ASM fixtures cover missing Bun, nonzero dependency exit,
permission errors and malformed thrown values; these remain source evidence,
separate from the installed ready capture.

The first fresh Ubuntu full-suite run lacked PyYAML in KVM's Python fixtures.
An isolated `PyYAML==6.0.3` environment matching CI was prepared; the failed log
was retained. The final Ubuntu full marketplace suite and hermetic checks both exited zero.
The full suite reported `All plugin suites passed.`; original failures remain
private. Final tracker, catalog and privacy checks are recorded in the linked PR.
Discovery remains 23.8.0 and minimum compatibility remains 23.5.1. This change adds
qualification tooling and receipts; it changes no published plugin payload.

## Gate scope and remaining actions

Only lifecycle integration, setup and status capture gates advance from this
receipt. Expansion is not applicable to their unexposed control, with the reason
recorded per gate. Other lifecycle gates remain open for complete installed
unavailable/partial/failed-state and long-evidence qualification. No source
fixture is promoted to installed or service acceptance.

The guarded guidance workflow in 1722 remains separate: queued submission is not
an executed model turn. Account-dependent ASM service acceptance remains deferred
by the user. Next actions are to execute admitted shipped guidance when its queue
advances, capture current installed tool fixtures and qualify remaining lifecycle
outcomes safely. No deployment, credential change or human-reviewed setup was
performed. Campaign 1579 and ASM child issue 1600 remain open.
