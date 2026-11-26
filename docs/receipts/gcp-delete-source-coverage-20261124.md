# GCP delete capture source coverage

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

Delete capture now retains exact completed output bindings when stderr is empty.
The original input monitor verifies the empty extent and SHA-256 digest together
with the original file and parent identities. Changed output remains refused.

An issuer-owned collector rechecks durable plan and output inputs after closure.
It reports the actual `delete-output` source with zero subordinate reader actors;
it does not claim execution, guest acceptance or independent resource absences.
The held factory uses that collector for delete-only preflight and final closure,
and rechecks delegated inputs before returning persisted reader coverage.

## Verification

Attempts a2418 and a2419 retained failing-first missing source coverage and empty
stderr closure failures. Attempt a2420 passed 21 factory cases with 172 assertions.
Attempt a2421 passed 29 capture/factory cases with 221 assertions and 53 related
closure cases with 241 assertions. Its two formatting findings were repaired.
Attempt a2423 passed the final tracked delete suite: 10 cases and 89 assertions,
including copied collectors, premature collection, changed output before and
after closure, and an originally empty channel changed after closure.

Three strict typechecks, the normal three-plugin runtime build, generated catalog
and dependency checks passed. Configured Biome checks and both privacy scans pass.
Private native captures and earlier failure receipts remain retained.

## Acceptance boundary

The complete factory remains inactive and untracked. Fresh normal GCP session
preparation now persists the request-reason, configuration and provider-lock
fingerprints and original session inputs; the consumed earlier plan is preserved.
Actual before/final guest capture, same-provider renewal across real expiry,
ordinary Ubuntu runtime acceptance, full lifecycle/network/traffic/recovery,
independent cleanup, CI/review/merge and published installation remain unfinished.
This receipt qualifies source behavior only.
