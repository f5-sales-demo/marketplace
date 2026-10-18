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

## Qualified starting point and remaining work

The source baseline is Salesforce 2.3.11 at marketplace commit
`917143c428206f5876debf727e666d999fb81b80`. Its six tools declare presentation
views but also provide private `renderCall` and `renderResult` overrides. Its
private implementation owns table/frame layout, narrow-width fallback and
progress frames; its command helper owns width-aware shell continuations.

The ownership check permits only the existing six named Salesforce overrides
while the runtime prerequisite remains open. That migration baseline does not
complete `salesforce.delivery.adapter` or any installed visual acceptance task.
New imperative tool renderers outside that baseline fail registration validation.
Production-source checks reject runtime-internal imports, cross-plugin imports
of Salesforce presentation, and wholesale private-renderer copies, including
copies whose comments or whitespace changed. These checks supplement review;
they cannot prove that an independently rewritten renderer shares no behavior.

The original private installation receipt verifies 101 files against the exact
2.3.11 tag. It has no visual findings. A fresh comparison verifies all 101 files
on both Mac and Ubuntu. Neither proof substitutes for historical or fresh native
terminal captures. `shared.contract` is qualified by the fresh automated native baseline in
[the native receipt](receipts/salesforce-native-baseline-20261018.md). Fresh module readiness is reported separately from native binary/TUI
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

This document defines the ownership contract and migration gates. It preserves the qualified native renderer baseline while the shared-runtime
prerequisite and Salesforce adoption remain pending.

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
