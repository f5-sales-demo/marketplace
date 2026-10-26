# GCP routing schema bounds qualification

During issue [1559](https://github.com/f5-sales-demo/marketplace/issues/1559)
qualification, Platform accepted BGP port `0` against the pinned published API.
The publication expresses that field's range through explicit F5 protobuf
validation annotations rather than standard JSON Schema bounds.

The shared wire validator now enforces declared `uint32.gte` and `uint32.lte`
bounds and intersects them with existing JSON Schema bounds. Malformed,
out-of-range and contradictory bounds refuse contract construction. The rebuilt
Platform runtime includes the same validation. No operation is enabled by this
change, and historical receipts and release assets remain unchanged.

Failing-first regressions cover port limits, intersection, malformed annotations
and the full unsigned range. All 647 CE tests across 113 files pass, together
with Platform typecheck and changed-source/runtime Biome checks. The documented
three-plugin runtime build succeeds.

A fresh real `VerifiedRoutingContract.release()` verifies immutable API release
`v7.0.1`, commit `2513fe498149c98fb737ff2ab207704b8a86fec6` and OpenAPI digest
`sha256:48863c0a2e6c6a6fde050f4f8f5a6966b02872851fa1acb7830f26ef2e143cd9`.
The changed validator accepts a six-peer synthetic BGP replacement and rejects
an invalid port, excess peers and an invented field. This is publication and
schema evidence. The candidate uses synthetic site/interface identities and
reserved example addresses; no authenticated platform call or routing action
was submitted.

Current Google guidance documents [multiple NIC load balancing and next-hop
constraints](https://docs.cloud.google.com/load-balancing/docs/internal/ilb-next-hop-overview)
and [NCC router appliance configuration](https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/how-to/creating-router-appliances).
A GCP consumer still requires qualified original CE interface/SLO bindings,
Cloud Router peer identities, route policies, session and effective-route
observations, return-path symmetry, traffic and restoration. A schema-valid BGP
object does not establish those capabilities.

The original guest journal and runtime namespace mapping holds remain active.
The changed source requires fresh installation qualification and cannot inherit
previous installed acceptance or saved-plan authorization. Full issue acceptance,
live campaigns, review, merge, publication and published user-scope installation
remain incomplete.
