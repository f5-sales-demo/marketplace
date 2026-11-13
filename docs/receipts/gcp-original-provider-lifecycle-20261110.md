# Original Google provider lifecycle candidates

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 412.

The bounded source parser now pairs the pinned Google executable's startup,
numeric PID and exit records with serialized Google SDK RPCs. Terraform 1.16.6
build metadata pins go-plugin 1.7.0. Its checksum-verified source confirms that
startup uses path and argv fields, while exit uses a plugin path and string ID.
The actual trace has separate schema and execution processes. The parser keeps
both and never chooses the latest process or uses timestamps to infer an RPC.

Strict incremental JSON decoding rejects duplicate keys, changed identities,
overlapping or replayed PIDs and RPCs, reattachment, malformed fields, truncation
and exceeded bounds. The parser admits at most 1 MiB per line and 64 MiB per
stream. Candidates retain the exact reviewed plan hash, RPC request ID and
hashes of startup and received/served records. Initial missing-module and
conflicting-identity failures remain preserved. The focused run passes 33 tests
and 174 assertions; the shared run passes 1,036 tests and 4,672 assertions.
All three native TypeScript checks, runtime builds and dependency checks pass.

A fresh authenticated standard-runner fixture retained 9,592 valid trace
records through the original output capability. The lifecycle parser identified
two Google processes and six RPCs. Exactly one read candidate joined the HTTP
candidate by request ID, resource type, reviewed plan hash and both raw RPC
record hashes. Final no-change planning, typed teardown, empty destroy, stable
empty state and two non-submitting resumes passed. Independent kernel and
psutil checks verified all 26 original groups absent. The source receipt is
`b1a855c6c6758c45a46751d1ddb4199df65bf4749d89efd7e8114e924c8985f3`.
The independent cleanup receipt is
`301a071284b0586be58ddbe3ee8a7ae041e69ce6aae321d37f01fb0156e4e1a4`.

The reviewed fixture allowed one local builtin create and one Google zones
read, with zero managed cloud resources or mutations. Synthetic CE and unused
Platform fields were not applied. This proves source composition; independent
original provider process and stderr pipe corroboration remains required.
Upstream process waiting and stderr forwarding use separate goroutines, so
provider exit alone cannot prove complete forwarding. Process, apply RPC and
original insert qualification flags remain false. The default full installed
capture controller remains absent and ordinary GCP apply refuses before plan
consumption. Managed action/request/audit/operation/incarnation joins, full guest
capture, every native and Terraform lifecycle, networking, traffic and recovery
gate, ordinary installed Ubuntu runtime, review/CI/merge, qualified publication,
downloads and published installation remain open.
