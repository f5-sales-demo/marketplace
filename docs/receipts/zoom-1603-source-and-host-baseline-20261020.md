# Zoom lifecycle and presentation source qualification

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Child: [1603](https://github.com/f5-sales-demo/marketplace/issues/1603).
Implementation: [1750](https://github.com/f5-sales-demo/marketplace/issues/1750).

Source commit: `e0ceebebf16f17b84d8118cc9082c5b69edadee5`. Plugin: `1.3.1`.

Lifecycle probes retain literal failure guidance and complete observations,
report a missing Python executable as setup required, preserve unexpected
execution errors, and reject malformed status envelopes. A failed process
cannot qualify ready. Distinct stderr guidance remains available.

Shared presentation shows request scope, meeting state, camera readiness,
verification and completion. Accessibility lists preview twelve rows.
Expanded evidence retains complete results once, including opaque corrective
guidance; invalid results retain automatic evidence fallback. Direct command
messages retain the evidence that was previously dropped. The adapter no
longer displays an executable that the plugin does not ship.

Six initial behavioral regressions failed. Two additional regression checks
failed before the final repair. Focused lifecycle, ownership, tracker and
qualification checks passed: 97 tests and 806 assertions. Python fixtures
initially failed on Mac platform and temporary-path assumptions. Fixtures now
model the supported host and canonicalize temporary paths: all 24 tests pass,
including an explicit production unsupported-host guard check.

Published minimum runtime `23.5.1` accepted the actual IntegrationRegistry
and PresentationAPI boundaries without subprocesses. This does not establish
full-loader or installed compatibility. Discovery remains `23.8.0`, with
22 plugins, 314 surfaces and 2,670 tasks. Tracker reconciliation reopens
changed fingerprints and preserves historical receipts.

Changed-file pre-commit and privacy enforcement passed. Installed stable
runtime `23.9.5` reported `setup_required (terminal_camera_not_ready)` on
both hosts before this change. Those old-payload observations do not qualify
this release. Raw outputs and failed attempts remain private.

Next actions: run the full Ubuntu suite, merge a green linked PR, verify
immutable publication and exact installation, then qualify lifecycle and
safe status or awareness observations. Setup, media changes, meeting joins,
authentication and communications remain outside this campaign. Supported
service and required human acceptance remain separate gates. Child 1603
remains open.
