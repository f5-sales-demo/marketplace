# Original captured cleanup runtime composition

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

GCloud 1.7.80 composes the original captured source authorization and durable
cleanup capability with normal Platform observations and the shared Terraform
service. It reads the original deployment manifest, configuration and provider
lock rather than preparing another deployment. Original storage, selected tenant,
source evidence and independent reader closure are checked throughout. API input
is captured before asynchronous preparation, credentials can refresh within the
original tenant, and a closed runtime refuses further operations. Original failed
claims remain intact and the consumed creation plan cannot be replayed.

## Verification and remaining gates

The missing opener and normal export failed first. Two further tests demonstrated
API redirection during preparation and returned storage mutation before their
repairs. The focused source suite passed 31 cases and 120 assertions, including
its imported provenance fixtures. The affected GCloud, Platform and shared
cleanup suites passed 834 cases and 4,235 assertions across 134 files. Both strict
typechecks, normal builds and configured lint passed. Cloud and Platform effects
in these tests are synthetic; this establishes no actual GCP cleanup acceptance.

The opener serves captured cleanup recovery. Successful source-campaign cleanup
still requires its own original applied evidence and authorization path. The real
worker needs exact current CLI, account, configuration, original reader coverage
and independent physical closure bindings. Fresh Google authentication and actual
installed reads remain prerequisites to another campaign. Every original native
and Terraform networking, lifecycle, traffic and recovery gate, independent
teardown/restoration, configured-model runtime, current-source CI/review, merge,
publication and published installation remains open. No campaign was submitted.
