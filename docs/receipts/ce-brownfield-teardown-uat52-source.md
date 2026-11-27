# CE brownfield teardown UAT52 source verification

Public aws_ce_teardown preparation qualifies the single-node brownfield placement from immutable rollback
references and fresh profile/account/partition-bound cloud observations. It persists the exact original
binding. Apply reloads only an existing binding, checks it against the immutable plan baseline, rereads six
existing VPC/subnet/route-table/gateway references twice, and passes that qualified binding to the owning
Terraform current-configuration resume path.

Missing, forged, foreign, unavailable, partial, duplicate, changed, operationally unavailable or cancelled
observations reject. This stage performs read-only cloud operations; it does not admit brownfield deployment
mutations. The AWS single-node/non-HA guard remains unchanged.

Red/green public regression reproduced the prior missing-placement session failure. Source checks pass on both
greenfield and brownfield public paths, and native teardown never opens Terraform. Completed direct-route
retirement integration is inherited from UAT51. Interrupted direct restoration/relinquishment reconciliation
and fresh live preservation remain pending.

UAT51 plugin suites passed in CI. Its Markdown and shell-inventory checks failed because the source receipt
exceeded the 400-character line limit. UAT52 wraps that receipt and preserves the failed logs privately.

Exact UAT52 archives, installed new-stage execution, exact-head CI and fresh cloud/network lifecycle
acceptance require separate receipts. No new cloud plan or apply was executed. Vendor SLI-only control,
original CE freshness/publication semantics, six-interface transition, full live matrix, failed 212977 ms
recovery against 45000 ms, producer publication/repin, full cleanup and explicit UAT acceptance remain open.
No final UAT delivery or normal release.
