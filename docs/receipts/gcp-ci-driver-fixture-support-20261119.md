# GCP CI dependency fixture support

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Current-head Shell Unit Tests failed because the dependency-repair fixture copied
the canonical plugin runner without its newly required regression scripts.
The same failure reproduced locally before the fix. The fixture now retains the
real native-only coverage test, CLI attribution test and its supporting hermetic
driver. Each guard creates its own isolated fixture; no production check is
removed or replaced with a passing stub.

All 16 dependency checks pass, including continuation after frozen dependency
repair. All 18 shell test scripts executed by the failed CI job also pass.
Source and dependency bindings remain unchanged during verification. Original
CI logs and failing-first evidence remain private and preserved. Current-head
GitHub confirmation remains required.

The full shell suite separately exposed a managed translation-policy test that
emits a missing retired-watcher error before reporting a pass. That finding is
retained and requires repair through docs-control. Translation generation and
retired controls remain disabled.

This change affects the test fixture only. Full GCP live, installed runtime,
review, publication and downloaded/user-installed acceptance remain open.
Frozen collectors, failed captures, historical locks and immutable v12.3.1
remain preserved.
