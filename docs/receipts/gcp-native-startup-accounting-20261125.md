# Native GCP startup accounting and refusal evidence

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

The supported GCloud 1.7.75 and Terraform 2.4.172 candidate completed ordinary
Ubuntu runtime checks with the configured model. Actual registered tools verified
native-default and explicit-Terraform readiness, a concrete owning-engine refusal,
and authentication failure in a separate configuration without Google credentials.
Both sessions exited normally with original process groups absent and user
settings and real Google configuration/ADC bytes unchanged.

The next source-owned GCP worker completed its independent 21-resource review and
prepared all eight capture stages. Its native startup failed before command
submission. Preflight consumed over 21 seconds, while startup was incorrectly
measured from the earlier invocation time. The original bootstrap appeared about
125 milliseconds after its OS birth. The generic final identity error hid the
native startup refusal in the caller summary.

Startup now begins at the native spawn attempt and remains capped at 15 seconds.
The original invocation time still governs the command timeout, and the original
operation deadline remains fixed. The effective startup cutoff also respects
both deadlines. Final capture still reserves its original separate five-minute
window. A missing invocation identity remains refused; only known native reasons
are included in the diagnostic, without adopting identity or echoing arbitrary
input.

## Verification and preserved failure

Attempts a2483 and a2485 retained failing-first timing and diagnostic tests.
Attempt a2484 passed 32 native executor cases with 198 assertions and 30 related
closure cases with 162 assertions. Attempt a2486 passed final-dispatch and source
closure checks, including the existing isolated nine-case dispatcher fixture,
with strict Terraform typecheck, normal runtime build and configured lint.

Independent disposition verified all 21 resources absent, all 14 original native
process groups absent, no submitted native apply, and no state file or executor
lock. The consumed applying checkpoint, immutable worker terminal and failed
capture flags remain unchanged. No cloud resource cleanup was required.

## Remaining acceptance

The complete capture factory remains inactive. The changed startup path still
requires full source qualification with actual installed input checks and a
fresh scope before another campaign; the consumed plan will not be reused.
Actual original guest/expiry capture, all lifecycle/network/traffic/recovery,
independent teardown/restoration, CI/review/merge, publication and published
installation remain unfinished.
