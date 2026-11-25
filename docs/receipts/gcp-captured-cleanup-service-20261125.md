# Shared service for original captured cleanup

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

Terraform 2.4.179 accepts a compiled original cleanup admission in its normal
shared service and passes it to the existing runner. GCloud 1.7.78 contains that
service capability in its runtime. The service snapshots recovery metadata,
requires its original executor and closure callback, restricts cleanup to the
original GCP workspace and resume, and rechecks closure on every operation.
Default sessions retain their executor, storage and credential behavior.

The handoff preserves original failed executor claims and immutable recovery
inputs. It grants no ownership or deletion authority. The existing runner and
domain still require exact source identities and a reviewed delete-only plan;
original creates, foreign deployment/provider/stage requests and replay remain
unavailable. Runtime resolution retains the same capability, and closing the
original admission retires later session operations.

## Verification and remaining gates

Eight service cases failed first. The affected service, runner, Google ADC,
original cleanup, durable recovery and native transport composition suites passed
167 cases and 961 assertions. Both strict typechecks, normal runtime builds and
configured lint passed. The earlier full Terraform and GCP run passed 1,655 cases
without source drift before this service handoff; current-source CI remains required.

The real installed SDK probe launched through the qualified system executable
mapping and exited naturally without process signals, but Google requires
reauthentication. Its failure and final capture are retained. The campaign remains
planned and unsubmitted. Actual original reader-group and Platform ownership
bindings, reviewed successful or interrupted cleanup, full command release and
every original guest, provider-expiry, lifecycle, networking, traffic, recovery,
teardown, CI, review, merge, publication and published-installation gate remain
open. The complete capture factory stays inactive and historical artifacts,
receipts and locks remain preserved.
