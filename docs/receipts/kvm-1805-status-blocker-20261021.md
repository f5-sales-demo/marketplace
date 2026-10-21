# KVM 3.2.1 installed status and TUI prerequisite

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Plugin child: [1595](https://github.com/f5-sales-demo/marketplace/issues/1595).
Original lifecycle qualification: [1804](https://github.com/f5-sales-demo/marketplace/issues/1804).
Receipt delivery: [1805](https://github.com/f5-sales-demo/marketplace/issues/1805).
Runtime prerequisite: [5055](https://github.com/f5-sales-demo/xcsh/issues/5055).

Normal read-only CLI status was reverified on Mac arm64 and Ubuntu x64. The
stable TUI does not implement the corresponding status route. Its generic
plugin overview failed the public observer's literal-result selection on both
hosts. No lifecycle matrix or healthy-service acceptance is claimed.

## Installed provenance

Plugin tag `kvm/v3.2.1` resolves to immutable source
`68fe713b0ece8d3437738419f1b3598bc91f10b7`.
Archive SHA-256:
`6d953a59c86ed08a72d27a97c5393c96c0701927b3ff28ec247dccbb10326512`.
The [previous independent installed receipt](kvm-1737-installed-20261020.md)
records publication and installed verification. For this attempt all 32 payload
files were independently compared with those recorded artifact digests on each
host; all matched. The installed package manifest resolves `src/index.ts` as the
entrypoint. The preliminary preparation used a nonexistent entrypoint and stopped
before creating a launch or pane; that failure is preserved privately.

Scoped runtime executables returned `xcsh/23.9.5` and matched the previously
independently downloaded immutable runtime artifacts:

| Host | Runtime binary SHA-256 |
| --- | --- |
| Mac arm64 | `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e` |
| Ubuntu x64 | `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2` |

Discovery remains 23.8.0; minimum compatibility remains 23.5.1. No published
plugin payload, development dependency or installed default runtime was changed.

## Published minimum-runtime CLI loader

The independently downloaded 23.5.1 binaries were rechecked against their
recorded SHA-256 before invocation. Immutable runtime source is
`753953842ba2d889b9715000534874e67c152a98`.

| Host | Minimum runtime binary SHA-256 |
| --- | --- |
| Mac arm64 | `923cc6f756f9311f20270c6fee4bc48fc29ded6bdcdbb453baba581dec4d1f22` |
| Ubuntu x64 | `a43926e29b394a315be60550d3b5639ffa4492d3d12b25d8d2b87a75e02b1a9b` |

The published runtime's documented `PI_CONFIG_DIR` configuration selected a
task-owned namespace containing only the existing user-scope KVM registry entry,
pointing to the actual installed 3.2.1 payload. All 32 files matched each host's
independent artifact digests before loading. The normal installed registry digest
was unchanged after invocation; no payload was copied or edited.

Both real binaries executed `plugin status kvm --json` through the normal CLI
loader and exited zero, preserving `kvm`, `unavailable`, `dependency_missing`
and an absent next action. This qualifies isolated installed minimum-runtime CLI
loading. The full mixed catalog includes plugins requiring 23.8.0; isolation
does not qualify those plugins or full mixed-catalog compatibility. No Platform
dependency readiness, supported-host service, TUI dispatch or setup acceptance
is established by this unavailable snapshot.

Private evidence identifiers are
`marketplace-minimum-binary-mac-20261021/kvm-isolated-status` and
`marketplace-minimum-binary-ubuntu-20261021/kvm-isolated-status`. Binary
provenance verification and the preserved mixed-catalog loader failure are
documented in [the minimum-runtime receipt](https://github.com/f5-sales-demo/marketplace/blob/4c02e46e72312e2aeb80e3dec82cc43248192dac/docs/receipts/ghostty-1806-installed-20261021.md#published-minimum-runtime-cli-loader).

## Supported CLI and rejected TUI result

Both hosts executed the real scoped binary with `plugin status kvm` and
`plugin status kvm --json`. Human output was exactly:

```text
kvm: unavailable (dependency_missing)
```

JSON preserved integration `kvm`, name `KVM Secure Mesh Site v2`, plugin `kvm`,
state `unavailable` and reason `dependency_missing`. Volatile times are private.
This integration snapshot does not establish controller readiness, readiness of
its Platform dependency or a healthy existing environment. Mac is also outside
the KVM controller's Linux x64 supported-host requirement. The literal reason is
preserved; no more specific causal diagnosis is inferred from it.

Each TUI loaded the actual installed entrypoint and the unchanged public
`scripts/observe-marketplace-lifecycle.ts` observer, with extension discovery and
model tools disabled. Normal `/plugin status kvm` returned a generic plugin
overview, without the KVM lifecycle result. `/plugin help` omits status.
`/marketplace-lifecycle-capture` rejected both results with
`Expected one dispatched lifecycle result; found 0`. No `ready.json`, frames or
successful capture were produced. The Ubuntu preliminary expected text used an
older setup-required hypothesis, but the actual overview contained neither that
state nor the independently observed unavailable state. It is retained as a
failed attempt, not converted into an accepted capture.

Published runtime source `src/slash-commands/builtin-registry.ts` has setup
handling and an overview fallback but no status case; CLI
`handleIntegrationStatus` supports registered integration status. Runtime issue
5055 requires a failing regression, a real read-only TUI route, required rigor
planning/TDD/completion audit, green delivery, stable publication, immutable
artifact verification and installed replay before these gates can advance.
Content-only CLI lifecycle issue 5053 is a separate prerequisite.

## Guard and resource closure

The observer recorded exactly one ready event with `activeTools: []` and one
normal `session_shutdown` per host. No model tool call occurred. Capture never
opened, so capture-closure or late-update behavior is not claimed by this attempt.
The task-owned Herdr pane returned to its original local shell after both scoped
sessions; the launch wrapper restored its terminal state. Other panes and the
queued Sales-engineer workflow were preserved.

Private evidence identifiers are `kvm1804-lifecycle-mac-20261021` and
`kvm1804-lifecycle-ubuntu-20261021`; CLI outputs, installed comparisons, TUI
rejections and session journals stay private. Physical viewport/font readability
is separate. No setup, deployment, account change, service startup or mutation
was performed.

## Verification and gate scope

Only documentation and affected editable tracker cells change. Tracker,
inventory, catalog, ownership, public lifecycle observer and qualification tests
must pass, along with changed-file lint/privacy and the required Ubuntu full
plugin/hermetic checks before delivery. Outcomes are recorded in the linked PR.
Source test results do not replace installed acceptance.

Lifecycle integration/status gates remain BLOCKED, with 5055 as the exact
rendering prerequisite. Setup-review/apply and healthy service remain separate
from this read-only status attempt. Complete empty/partial/failed/malformed/long
installed lifecycle evidence and executed guidance still require their own
qualification. The 48 combinations at 40/76/120/153 columns, both themes,
Unicode/ASCII/Nerd and both expansion requests were not run because no normal
status component exists. Unexposed CLI expansion is recorded as a limitation,
not an exemption for the missing TUI route.

Next actions: deliver and verify runtime 5055, then replay 1804's normal installed
TUI status matrix on both hosts; qualify safe setup review and supported-host
readiness separately. Account-dependent environments remain deferred by the
user. Issues 1804, 1595 and campaign 1579 remain open.
