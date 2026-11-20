# Final capture persistence failures

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 396.

Failure to write the executor's final receipt previously skipped its collector.
A missing completion receipt could release the original claim, while failure
to write the unresolved flag could hide the original capture error.

The engine now invokes its matching collector despite final-receipt persistence
failure, within the same original five-minute reserve. It retains independent
capture, completion, group-closure and persistence errors. Only the verified
success path releases the claim; missing required evidence keeps it held even
after natural executor and reader closure. Existing flags are never overwritten.

Six failing-first regressions use controlled local persistence failures and real
bounded original children. They cover final and completion receipts, unresolved
flags, simultaneous errors and late group-closure refusal. No process signals
were used; partial diagnostic directories and failed runs remain retained.

The final shared suite passes 844 tests with 4,435 assertions on pinned Bun 1.4.2.
Native Terraform typechecking, source Biome, three runtime builds and dependency
checks pass. The runtime/tracker suite passes 79 tests with 658 assertions.

This qualifies the engine persistence repair. The default cloud/serial/SSH
controller remains absent and new GCP Terraform apply remains refused. GCP guest
capture, full lifecycle and networking evidence, ordinary installed runtime,
cleanup, review, CI, merge, publication and published installation remain open.
