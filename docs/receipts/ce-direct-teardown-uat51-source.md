# CE direct teardown UAT51 source verification

The AWS Terraform cloud teardown stage now restores original direct routes and relinquishes their managed state before its first destroy plan. Completed direct retirement resume validates durable source/checkpoint bindings, regenerates the exact removal configuration, verifies absent route state, reads fresh complete original-route/interface cloud evidence, and requires an ordinary no-change plan without repeating mutations.

Regression tests first demonstrated the missing resume and unsafe destroy-plan ordering. Final focused validation: 28 tests, 104 assertions. Broad four-plugin validation: 1776 tests, 11010 assertions; all four compiler checks and runtime builds pass.

The coordinated candidate versions are platform 7.0.0-uat.51, AWS 3.0.0-uat.51, Azure 5.0.0-uat.51 and Terraform 3.0.0-uat.51. Minimum runtime remains 23.8.0; compiler dependencies use 23.9.3.

This is source evidence. Exact archives, installed new-stage execution and live route preservation remain pending. The public teardown tool still requires persisted brownfield placement integration. Interrupted restoration/relinquishment attempts retain journals and reject replay pending evidence reconciliation. No new cloud plan or apply was executed during these checks.

Vendor SLI-only control and original CE freshness contracts, six-interface transition, full live matrix, failed 212977 ms recovery against 45000 ms, producer publication/repin, inventory permissions, cleanup and explicit UAT acceptance remain open. No UAT delivery or normal release is authorized by these receipts.
