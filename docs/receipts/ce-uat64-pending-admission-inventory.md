# CE UAT64 pending admission inventory prerequisite

The registered teardown inventory requires both logical and physical site UIDs. Interrupted admission can leave an owned logical site and node-bound bootstrap tokens before
physical registration. These cases require their own evidence contract; absent physical identities cannot be manufactured.

The separate read-only pending-admission collector now returns exact logical and token identities, with explicit null logical/physical absence. It checks the complete scope twice,
including registration and routing/ingress collections. Physical sites, registrations, routing resources, foreign ownership, malformed or partial collections, duplicate or
conflicting identities, changing snapshots, authorization failures and service failures remain unknown. Specs and bootstrap content are excluded. The runtime exposes the collector
through its validated binding and existing API request service.

Validation passes 1925 four-plugin tests / 11645 assertions, focused inventory/runtime tests, platform/AWS compiler checks, four runtime builds, generated assets and public
mappings, readiness regressions and canonical tracker checks. All four candidate versions advance together to UAT64. This is a source prerequisite; the public pending-admission
retirement coordinator and its installed/live qualification remain required.

Readiness remains false: 288 required rows / 300 blockers. Recovery 212977 ms against 45000 ms remains failed. Vendor control/freshness, six-interface transition, complete live
matrix, producer qualification, independent cleanup, fleet convergence and explicit UAT acceptance remain open. PR1565 stays draft with auto-merge disabled; this candidate is not a
deliverable UAT suite.
