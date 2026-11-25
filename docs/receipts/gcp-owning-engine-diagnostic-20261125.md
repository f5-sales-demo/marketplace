# GCP owning-engine diagnostic

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

An ordinary Ubuntu session using the supported installed candidate executed
registered project identity and native-default/explicit-Terraform readiness
requests. An intentional engine mismatch returned only a generic validation
failure. The failed diagnostic remains retained; refusal alone did not qualify
its required user-facing behavior. The session exited normally with settings
unchanged and original process groups independently verified absent.

The source now returns an explicit `owning_engine_mismatch` before creating a
cloud adapter. It reports only validated requested and owning engine enums,
retains the owning engine, and reports that no cloud read or mutation started.
Malformed engine values remain refused without echoing untrusted input.

## Verification

Attempt a2454 retained three failing-first diagnostic cases. Attempt a2456
passed 20 focused cases with 77 assertions and all 469 shared GCP CE cases with
2,246 assertions. Strict GCloud typecheck, the normal three-plugin runtime build
and configured source lint passed. Current changes also undergo normal catalog,
dependency, prose, privacy and commit-hook checks.

## Remaining acceptance

The changed installed candidate still needs fresh ordinary Ubuntu verification
of the concrete diagnostic and isolated authentication failure. The complete
capture factory remains inactive. Actual original guest/expiry capture, full
lifecycle/network/traffic/recovery, independent cleanup and every original
CI/review/merge/publication/published-installation gate remain unfinished.
