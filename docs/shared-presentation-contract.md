# Shared marketplace presentation ownership

The runtime prerequisite is [xcsh #5000](https://github.com/f5-sales-demo/xcsh/issues/5000).
Marketplace [#1581](https://github.com/f5-sales-demo/marketplace/issues/1581)
owns the foundation, while [#1591](https://github.com/f5-sales-demo/marketplace/issues/1591)
owns Salesforce adapter delivery. Task statuses and receipts remain in the
[canonical tracker](marketplace-presentation-todo.md).

## Ownership boundary

| Concern | Runtime owns | Domain adapter owns |
| --- | --- | --- |
| Frames and width | Actual available inner width, wrapping, borders and clipping | Useful section ordering and labels |
| Commands | Exact argv quoting and width-safe Bash/Zsh copying | Command selection, target and flags |
| Tables | Cell layout, alignment, wrapping, preview and expansion | Column selection, units, currency and consequential scope |
| Theme and symbols | Current theme/preset at render time | Semantic state and domain emphasis |
| Progress | Refresh, frame advancement and cleanup for registered tools | Observed progress and completion state |
| Evidence | Safe fallback and complete expanded evidence | Meaningful defaults, warnings and redaction decisions |

Adapters declare views through the injected public `PresentationAPI`. They do not
import runtime implementation modules, another plugin's presentation implementation,
or copies of Salesforce's private renderer. Runtime code must use declared column
metadata instead of Salesforce-specific names such as Deal or Month. Currency,
query interpretation and business conclusions remain adapter responsibilities.

## Historical baseline and current delivery

The source baseline is Salesforce 2.3.11 at marketplace commit
`917143c428206f5876debf727e666d999fb81b80`. Its six tools declare presentation
views but also provide private `renderCall` and `renderResult` overrides. Its
private implementation owns table/frame layout, narrow-width fallback and
progress frames; its command helper owns width-aware shell continuations.

The ownership check rejects imperative tool renderers from every plugin, including
Salesforce. Copied legacy layout is detected using normalized hashed signatures
pinned to Salesforce 2.3.11 and its source SHA; executable private renderer code
is not retained as a baseline fixture. Imperative tool renderers fail registration validation.
Production-source checks reject runtime-internal imports, cross-plugin imports
of Salesforce presentation, and wholesale private-renderer copies, including
copies whose comments or whitespace changed. These checks supplement review;
they cannot prove that an independently rewritten renderer shares no behavior.

Salesforce 2.3.15 is now delivered on current `main`. Its six tools use data-only
adapters and runtime-owned commands, previews, evidence and progress. The
[canonical tracker](marketplace-presentation-todo.md#plugin-salesforce) retains
its completed qualification and immutable receipts, including real browser setup
acceptance. The 2.3.11 baseline below is historical provenance.

The discovery/registration lane remains pinned to published runtime 23.8.0. The
catalog runner uses the actual installed binary and records its version separately
(current Mac baseline: 23.9.3). Changing installed qualification does not change
the discovery fingerprint. A deliberate discovery upgrade requires reconciliation
of every invalidated claim; it cannot carry forward unsupported VERIFIED rows.

Removed lifecycle registration rows are preserved in the canonical tracker's
Retired surfaces appendix with their full prior status, evidence, receipt and
fingerprint, plus the removal reason, source SHA and delivery link. Only current
registrations count toward active surface coverage; unexplained removals fail.

The original private installation receipt verifies 101 files against the exact
2.3.11 tag. It has no visual findings. A fresh comparison verifies all 101 files
on both Mac and Ubuntu. Neither proof substitutes for historical or fresh native
terminal captures. The historical automated native baseline is retained in
[the native receipt](receipts/salesforce-native-baseline-20261018.md).
Current `shared.*` rows remain pending requalification after fingerprint invalidation.
Fresh module readiness is reported separately from native binary/TUI
acceptance. In this campaign, live Salesforce checks use the corporate MDM
MacBook. Ubuntu and the NUC cannot access that service by policy; their
installation/source checks do not establish service access. Their campaign checks are limited to source, artifacts and unavailable-state
qualification.

## Required behavior to preserve

The accepted Salesforce feature intent and current focused source regressions
establish requirements for readable defaults, complete safe evidence, correct
monetary grouping, explicit currency/scope, exact command copying, and progress
cleanup. Runtime adoption must independently qualify these requirements:

- Render at 40/76/120/153 columns, collapsed and expanded, in both themes and
  Unicode/ASCII/Nerd presets. Inspect captures individually.
- Keep useful results visible before expansion; preserve zero, false, empty
  strings, literal text, warnings and pagination.
- Distinguish empty, unavailable, partial and failed results. Unknown evidence
  must remain unknown.
- Copy commands in Bash and Zsh without changing arguments, including quotes,
  newlines, Unicode and literal shell-sensitive text.
- Switch live theme/preset without stale output. Advance registered-tool progress
  and retire timers on completion, cancellation and session shutdown.

This document defines the ownership contract and migration gates. It preserves the historical native baseline and completed Salesforce qualification.
The remaining plugins require their own current implementation and installed/service evidence.

## Verification

```sh
bun test tests/presentation-ownership.test.ts
bun test tests/installed-salesforce-verifier.test.ts
bun test scripts/presentation-inventory.test.ts
```

The inventory uses actual registrations and current canonical plugin roots.
The installed verifier imports the requested published runtime presentation API
and the exact installed plugin module. It reviews setup without executing it;
acceptance mode performs readiness and read-only org display. Its receipt labels
`installed-plugin-module` evidence and records both package versions, host and
setup execution status. Non-ready dependencies produce a sanitized blocked
receipt and do not execute a read-only tool or setup. This is deliberately separate from native binary/TUI
proof and model-driven scenarios.

## Catalog-driven qualification

`bun scripts/marketplace-qualification.ts` prints all 23 canonical plugins in the
campaign order, installed entrypoint conventions, current surface IDs, lifecycle
requirements and supported service hosts. It reads the existing tracker and adds
no new discovery fingerprint. Native tools, commands, messages, advisories and
content guidance remain separate exposed surfaces.

Load `scripts/observe-marketplace-campaign.ts` as an explicit extension of the
published binary, with automatic extensions disabled. Set private paths through
`MARKETPLACE_CAMPAIGN_ROOT`, `MARKETPLACE_CAMPAIGN_PLUGIN`,
`MARKETPLACE_CAMPAIGN_NAME` and `MARKETPLACE_CAMPAIGN_SCENARIO`. The scenario
contains a safe ID, `calls` with exact `{tool, args}` rules, and shipped relative
`guidance` paths. Optional `commands` bind exact `{name, args}` invocations.
The installed registry must agree with the selected path and manifest version;
`MARKETPLACE_CAMPAIGN_REGISTRY` overrides the default user registry for isolated tests.
Review those rules against the plugin's execution semantics:
an allowlist is a restriction, not authorization for a mutation.

Service mode observes normal runtime dispatch, tool selection, actual full
results, reviewed command dispatch, plugin messages and UI dispatch, lifecycle
callback returns, model context types and assistant
conclusions in separate private journal events. Only the selected tools and exact
arguments are admitted. Guidance mode uses an explicit guidance-only scenario.
The runner rejects unsupported service hosts, ambiguous rules and escaped paths.
It does not invoke setup, commands, advisory matchers or lifecycle handlers to
manufacture successful execution evidence. Use the normal shipped invocation and
retain its observed dispatch; missing event coverage remains unfinished.

Fixture mode requires `MARKETPLACE_CAMPAIGN_MODE=fixture` and an explicit
`MARKETPLACE_CAMPAIGN_FIXTURES` file. Synthetic `{id, tool, args, result}` cases
exercise the installed binary's real `ToolExecutionComponent`; plugin service
lifecycle handlers are suppressed and integration snapshots are synthetic.
The observer blocks registered-tool execution, plugin commands and `api.exec` in
fixture mode. Review entrypoint initialization before loading: arbitrary direct
process or network calls inside a plugin are outside these API guards.
Fixture captures never qualify service execution, model selection or lifecycle.
Fixtures may represent mutation outcomes without executing mutation tools.
Domain cases and literal expectations belong to each plugin's qualification suite.

After normal workflow completion (or fixture admission), invoke
`/marketplace-campaign-capture`, then run
`bun scripts/drive-marketplace-capture.ts <private-root> <checks.json>`.
Every case requires explicit inspection expectations (`contains`,
`collapsedContains`, `expandedContains`, `absent`, `expectedError`). The driver
checks each of the 48 combinations individually, retains findings, and exits
nonzero on any failure. `/marketplace-campaign-exit` retires the observer session.
Frame identity includes every appearance control and installed provenance. The
driver rejects public or symlink capture roots and preserves existing inspections.
Private raw results must be reviewed and sanitized before publishing receipts.

Native buffer checks do not establish viewport inspection, exact shell copying,
progress advancement/cleanup, service fidelity or executed shipped guidance.
Those gates require their respective retained evidence. Existing Salesforce
capture, viewport and progress controls remain available and unchanged.

## Development and minimum compatibility lanes

The current verified stable development lane is 23.9.3 (GitHub stable release and
npm `latest`, checked 2026-10-20). Changed runtime plugins migrate their exact
development pin and frozen lock to that release independently of the manifest
minimum and peer range. Existing qualified dependency pins remain during the
per-plugin migration; Salesforce and the 23.8.0 discovery graph retain their
historical qualification. This dependency lane does not verify any tracker row.

Run `bash scripts/run-plugin-minimum-runtime.sh aws` (or another runtime plugin)
after focused latest-runtime tests. The runner copies only that plugin into an
owned temporary directory, resolves and checks its exact declared minimum,
excludes cloud CLIs from the test PATH, and runs its Bun suite. It preserves the
source manifest, lock and installed graph, retains a private log, and removes its
owned copy. This is a source compatibility gate; installed rendering and safe
service/workflow qualification remain separate. Inspect test/import initialization
before running: PATH exclusions are not a sandbox for arbitrary network or direct
process operations.
