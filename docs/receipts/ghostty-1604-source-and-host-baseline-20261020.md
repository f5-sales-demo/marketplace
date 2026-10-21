# Ghostty lifecycle source repair and host baselines

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Child: [1604](https://github.com/f5-sales-demo/marketplace/issues/1604).
Implementation: [1749](https://github.com/f5-sales-demo/marketplace/issues/1749).

Source commit: `693cf3e4329e0ade520b9a6947db3b8536657aad`. Plugin: `1.2.1`.

The probe reports a missing Python executable as `setup_required (cli_missing)`
and preserves unrelated execution failures. Malformed JSON and invalid status
envelopes retain their evidence as degraded observations. Valid ready,
setup-required and unavailable observations preserve complete evidence,
including zero, false, empty strings, unknown fields and literal guidance.
A failed process cannot qualify ready output. Setup commands and user
configuration semantics are unchanged.

Two initial probe regressions failed. After repair, five probe regressions
passed. Focused lifecycle, ownership and tracker checks passed 78 tests and
654 assertions. All 28 Ghostty Python tests passed. A separate supported-host
regression failed before correcting the qualification catalog to Linux-only
Ghostty service acceptance; all 17 qualification checks then passed with
146 assertions. Unsupported-host observations remain separately testable.

Published minimum runtime `23.5.1` accepted the integration through its actual
IntegrationRegistry without subprocesses. This proves the registration and
setup-plan boundary only. Full-loader and installed compatibility remain open.
Discovery remains `23.8.0`: 22 plugins, 314 surfaces and 2,670 tasks.
Tracker reconciliation preserves historical receipts and reopens affected
fingerprints. No discovery upgrade was delivered.

Scoped installed runtime `23.9.5` reported
`ghostty: setup_required (receipt_invalid)` on both Mac and Ubuntu.
Those existing-plugin observations do not qualify the new payload or service
acceptance. No setup, launch, authentication or service startup occurred.
Raw outputs and failed attempts remain private.

Changed-file pre-commit and privacy enforcement passed. The broader all-file
lint sweep failed on existing spelling in ASM's generated runtime; its failed
log is retained. Source checks do not establish rendering, publication,
installed, supported-service or human visual acceptance.

Next actions: merge a green linked PR, independently verify immutable
publication and source contents, install the exact payload without applying
setup, then qualify real lifecycle output and restricted safe guidance on the
supported host. Required setup or human acceptance remains an explicit gate.
Campaign 1604 remains open.
