# Natural-exit process-lock qualification

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 394.

The shared suite contained one live process-lock fixture that requested SIGKILL.
That invocation conflicted with the goal's execution constraint. Its original
source and failed guard result remain retained.

The replacement acquires a lock in a real original child, verifies its PID and
live exclusion, closes only that child's stdin, requires natural exit code zero,
then reclaims the verified dead-owner claim. A failing-first guard rejects direct
signal calls in this fixture. The stopped-gate runner tests already model signal
requests and close the real child's stdin; their coverage remains unchanged.
The shared lock implementation already inspects process identities without
signal probes.

Five focused lock tests pass. All 831 shared GCP, Platform, Terraform and
integration tests pass with 4,383 assertions on the independently hashed
Bun 1.4.2 executable. Source Biome checks pass. This successor replaces the
constrained-execution hold on the earlier 830-test run; that run remains historical.

These are source and local process-lifetime checks. The actual cloud and serial
controller, fresh GCP campaigns, complete guest and traffic evidence, ordinary
installed runtime, review, CI and publication remain open. Full issue acceptance
and the active goal remain incomplete.
