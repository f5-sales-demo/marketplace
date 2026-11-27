# Original output reads during final capture

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

An expired operation previously blocked original output reads even during the
executor's separate final capture window. Terraform 2.4.119 uses the existing
full original input guard while the actual final callback is active. Initial
admission and release retain their operation checks. Executable identities,
original stream ownership and the fixed final deadline remain mandatory.

Failing-first tests used real gated output and an original monitored input.
Final input replacement permanently refuses capture and retains the unresolved
claim. An isolated clock fixture expires the original operation, accepts output
strictly before the final deadline, refuses it at that deadline and verifies
that successful final evidence cannot make the expired apply successful.

The first clock fixture froze time before the real bootstrap handshake and was
correctly refused. The revised fixture keeps the real clock through bootstrap,
then advances only after the original child runs. Failure evidence and claims
remain preserved. Production clocks and capture durations are unchanged.

A failing-first inherited-reader case also requires the same original parent
reserve around full input checks during the child final callback. Parent
changes refuse capture without adopting another reservation.

The final source passed 686 Terraform tests, strict typecheck and all three
runtime bundles. Combined Platform/GCloud regressions passed 825 tests.
Compiled/shared, catalog/tracker, privacy, normal hooks and CI checks are recorded
separately. No live GCP or guest acceptance is inferred.

Final VM/serial handoff and controller closure after a later independent group
absence remain to be qualified. Observer insertion mapping, built-in factory,
all original live networking/lifecycle/traffic/recovery/cleanup/restoration,
ordinary installed runtime and publication gates remain open.
