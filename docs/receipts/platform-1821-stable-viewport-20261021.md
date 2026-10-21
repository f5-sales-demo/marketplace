# Platform 6.2.1 stable native viewport qualification

Campaign [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
child [#1588](https://github.com/f5-sales-demo/marketplace/issues/1588), and
qualification [#1821](https://github.com/f5-sales-demo/marketplace/issues/1821).
The [historical installed and workflow receipt](platform-1690-installed-20261020.md)
and its failed attempts remain preserved.

## Fresh publication and installed binding

Stable tag `platform/v6.2.1` resolves to merged source
`387418874af3d365b2956e35246f930cae809a4c`. The release is neither draft nor
prerelease. Fresh independent downloads on Mac and Ubuntu have SHA256
`0ace0908c2710d96f66444795c8a6580c35e408bf977d1463137bac1e46c7046`.
All 193 shipped files match Git source, the downloaded archive and the current
registry-selected installed cache byte for byte on each host.

Both capture sessions use the latest verified stable xcsh 23.9.5, published
2026-10-20. The Mac binary SHA256 is
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`;
Ubuntu's is
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Each resolved executable and installed entrypoint was verified before capture.
The historical discovery fingerprint remains at 23.8.0. This qualification-only
change does not alter the plugin version, dependencies or default runtime.

## Individual native buffers and viewport reconstruction

The published binary's actual `ToolExecutionComponent` renders the installed
adapter. Seven unchanged synthetic cases cover capabilities, site, plan,
bootstrap, unavailable telemetry, failure and malformed results. Their literal
expectations cover identity, scope, twelve-row network summaries, complete
plan/bootstrap evidence, zero, false, empty strings and corrective guidance.
Fixture mode denies tool and service execution, including synthetic create and
bootstrap paths. No infrastructure or authentication action occurred.

Each case covers 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd. Each full buffer is inspected independently. Every actual
viewport page matches the expected clamped offset and source rows; final-page
overlaps agree and reconstruction equals the complete buffer.

| Host | Native buffers | Viewport pages | Failures | Terminal geometry |
| --- | --- | --- | --- | --- |
| Mac | 336 | 480 | 0 | 159 columns by 51 rows |
| Ubuntu workstation | 336 | 480 | 0 | 159 columns by 51 rows |

Fixture SHA256 remains
`84e2855f4dab9399420d6594aa258bb3b8c378e72f8705a01d392dfaff3e72fb`.
Expectation SHA256 remains
`0a66a51cfe45db6cd5a795dbe39cced80141db6e1f8aaa15f0e7ecf4bb7254ab`.
Neither historical fixture nor occurrence expectations were weakened.
Theme and symbol controls change within each running session. Journals on both
hosts record one capture closure and one session shutdown, with zero tool
executions. Foreground process inspection verifies both owned panes returned
to their shells. Observer cleanup does not establish plugin progress cleanup.

Tracker, inventory and ownership validation passed on both hosts: 12 tests and
506 assertions each. Changed-file pre-commit and privacy checks passed. Initial
receipt link formatting and Markdown validation failures were corrected; their
logs remain private. Every non-Platform tracker row remains identical.

## Shared checker prerequisite and remaining acceptance

The tested checker repair is
`494e84bdd8e5695bda7222c2ce7a10ca44f6506a`, captured from branch head
`22039baa6387ac86c3eadb020165e9a75741b6f1`. It is delivered through
[PR #1812](https://github.com/f5-sales-demo/marketplace/pull/1812).
Native gates remain BLOCKED until that PR merges and these preserved captures
are independently reinspected using its delivered source. Passing branch
checks do not complete shared qualification or supersede historical receipts.

These seven fixture cases do not establish every command, skill, agent,
lifecycle, progress, Bash/Zsh argv or physical readability gate. Executed
shipped guidance requires separate guarded workflow evidence. Account-dependent
service qualification remains deferred by the user; resume when the context
owner supplies a working existing API context for bounded read-only scenarios.
Telemetry additionally requires its supported contract. No service startup,
deployment, meeting join or external communication occurred.

Private evidence identifiers are
`platform-1821-stable-darwin-20261021-r18` and
`platform-1821-stable-linux-20261021-r18`. They retain independent downloads,
all file digests, original fixtures and checks, individual buffers/pages,
inspection results and journals. Raw evidence remains private. Keep campaign #1579
and child #1588 open; retire only task-owned resources after merged receipt
delivery.
