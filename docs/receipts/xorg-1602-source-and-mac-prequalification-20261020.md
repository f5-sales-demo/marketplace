# Xorg source repair and Mac baseline

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Child: [1602](https://github.com/f5-sales-demo/marketplace/issues/1602).

Xorg 1.3.1 preserves failed controller stderr and literal corrective guidance,
checks capability version identity exactly, reports a missing executable as
`setup_required (cli_missing)`, and shares argv construction between execution
and `pi.presentation.command`. Setup, session and desktop mutation semantics are
preserved. No service startup or setup application occurred.

The five initial behavioral regressions failed. After repair, six regressions
passed, including exact Bash/Zsh argv reconstruction with a harmless Python
executable, failed stderr, malformed/null envelopes, partial and empty results,
and thirteen-row windows with twelve-row preview, zero PIDs, false and empty
titles. The focused lifecycle and ownership suite passed 70 tests and 641
assertions. All 45 Xorg Python tests passed; the existing accessibility fixture
now mocks executable discovery as well as its command, removing its dependency
on host `gsettings` installation.

Expanded valid results include the complete parsed envelope once and preserve
additional opaque stdout/stderr. Invalid results retain runtime fallback and
literal text. Selected desktop summary fields are all visible; raw findings
retain standard runtime previews. No private renderer or timer was introduced.

The installed Mac plugin remains 1.3.0. Scoped runtime 23.9.5 reported
`xorg: degraded (version_mismatch)`. This baseline does not qualify 1.3.1 or a
supported Ubuntu Xorg service. Raw outputs and failed attempts remain private.

Tracker reconciliation preserves discovery 23.8.0, 22 plugins, 314 surfaces and
2,670 tasks, historical receipts and Salesforce qualification. Xorg and shared
fingerprints require current evidence. Minimum-runtime, full-suite, publication,
immutable artifact, installed matrix and safe service workflow gates remain
pending. The next action is a green linked PR through Ubuntu, independent
publication verification, then supported-host installed lifecycle and restricted
read-only service qualification. The campaign child remains open.
