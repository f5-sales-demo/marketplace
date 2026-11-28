# Provider identity checks during GCP capture

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

The full source startup probe still refused startup after the corrected native
clock. No startup-qualified proof was produced. Independent disposition verified
21 resource absences, 12 original native group absences, no native command
submission, no state file and no executor lock. The consumed checkpoint and
original failed-capture evidence remain unchanged.

The capture context's provider getter repeated full executable hashing while
serving original bindings to the collector stages. It now uses the existing
continuous identity verifier for those already admitted files. It retains the
original hashes and file/parent identities, watcher failures and permanent
replacement or write-restore refusal. Full byte verification remains at provider
admission, command release and final capture; the getter does not admit new pins.

## Verification and remaining acceptance

Attempt a2497 passed 12 identity/input cases with 32 assertions and 52 execution,
prepared-scope and final-dispatch cases with 281 assertions. Strict Terraform
typecheck, normal runtime build, configured lint and privacy enforcement passed.
Full-digest release/final failures remain effective, including restored bytes
and altered metadata. The original 15-second native startup limit, command
cutoff, two-hour operation deadline and separate five-minute final reserve
remain unchanged.

Full source startup still requires fresh qualification before a cloud command
is permitted. The complete capture factory remains inactive. Original guest
capture and real same-provider expiry renewal, all lifecycle/network/traffic/
recovery, independent teardown/restoration, CI/review/merge, publication and
published installation remain unfinished.
