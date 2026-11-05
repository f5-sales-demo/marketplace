# Original-invocation final capture

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 395.

The installed runtime previously checked executor-group closure before invoking
final capture and retained only the latest invocation's group. A timed-out
surviving child could suppress capture; later calls could select the wrong group.

The runtime now admits each invocation by its original PID, process-start ticks
and boot identity. Original claim and lifetime file bytes and parent identities
are frozen and checked before startup and around final capture. Duplicate
admission and identity replacement refuse selection.

The installed wrapper invokes capture for the matching invocation even when its
receipt persistence or group metadata checks fail. Errors remain aggregated after capture and the final
input checks. The executor starts capture at its original failure boundary before
waiting for natural completion. The five-minute deadline remains fixed. A separate
completion receipt records actual exit and group closure; those remain required
before claim release or disposal. Failed capture flags and historical receipts
remain preserved.

Six failing-first dispatcher tests and a real original-child timing regression
qualify the change. All 27 focused tests pass, followed by 838 shared tests with
4,404 assertions on pinned Bun 1.4.2. Source Biome and the native Terraform
TypeScript check pass. No process signals or cloud submissions were used.

These checks do not qualify a GCP guest, cloud/serial controller, application
traffic or ordinary installed runtime. The default controller is still absent
and GCP Terraform apply remains refused. All remaining live, cleanup, review,
CI, publication and published-installation gates remain open.
