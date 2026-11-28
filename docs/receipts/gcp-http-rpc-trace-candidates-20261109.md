# Google HTTP and RPC trace candidate parser

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 408 implements bounded assembly of the pinned Google 8.7.0 HTTP dump
inside its protocol 5.11 RPC records. Terraform forwards each physical dump line
as a separate JSON record. The parser requires complete markers, original request
identity, reviewed method/target/reason and a matching served RPC. Returned
projections contain immutable hashes, status and scope; they expose no request
credentials or bootstrap body. Apply and insert qualification remain false.

Twelve new trace regressions and the fourteen core-hook regressions pass together:
26 tests and 134 assertions. Cases cover split bytes, overlap, replay, changed
identity, wrong protocol/host/scope, duplicate headers/JSON keys, missing markers,
truncated bodies, provider errors, caller mutation and fixed line/dump limits.
Additional failing-first cases repaired multiline diagnostic classification,
coercible timestamps and unpaired markers. A shared strict JSON decoder preserves
the core parser's duplicate-key and nesting refusal.

A retained original trace regression passes, with historical evidence attributed
to its original receipt. A fresh pinned execution then fixes the expected scope
before apply. It uses an authenticated owned ADC snapshot and a saved plan that
permits only one builtin local resource and a deferred Compute zones read.
The current source parser matches one complete original RPC/HTTP transaction.
Reviewed local teardown leaves stable empty state and all eight original groups
are independently absent, without signals. No cloud resource or mutation occurs.

The first fresh execution completed its local apply, but the exact trace scope
omitted an empty `filter` query parameter that the SDK sends. The parser refused
the missing match. A separate reviewed delete-only recovery removed its local
fixture, followed by empty destroy planning, stable state and independent absence
of all ten original and recovery groups. Its failed capture remains unchanged.
The successor changed the scope from the pinned
[data-source implementation](https://github.com/hashicorp/terraform-provider-google/blob/v8.7.0/google/services/compute/data_source_google_compute_zones.go),
which explicitly sets `filter`, and used a fresh workspace, reason and plan.
The target comparison was not weakened.

The successful private source-composition receipt has SHA-256
`1604c659cc67cf900e7ca2a780c12bb93662bb2f1ff0e6f389276db3cdde509b`.
Its independent cleanup receipt has SHA-256
`0a963327d1aa28c5c27dfb0f03a29508e152844ad4fd62f6732c282665ee2859`.
The failed predecessor's independent recovery receipt has SHA-256
`b86cce10601541ff0aa0a46f6fab77d93b11e48154275f6dbf0d631215490bd6`.

These observations qualify candidate parsing and the original read contract.
The installed controller still needs original descriptor/file/parent/producer
admission and an actual reviewed apply, request/audit, operation and numeric
incarnation join. Candidates cannot authorize those operations. Full guest,
native/Terraform lifecycle and networking, verified traffic/recovery, ordinary
installed Ubuntu runtime, review, merge, release and published installation
remain required.

The shared run exposed a pre-existing credential fixture timing defect: two
clock samples could declare an authentication lifetime one millisecond beyond
the existing one-hour limit. An isolated frozen-fixture reproduction confirms
3,600,001 milliseconds and the production refusal. The fixture now uses one
captured timestamp, so structural credential cases reach their intended guard.
Production lifetime and credential checks are unchanged.

The relevant shared suites pass 999 tests and 4,414 assertions. All three
TypeScript checks, runtime builds and dependency checks pass. These source
checks and original read composition do not authorize an installed apply or
prove live CE registration, networking, traffic or lifecycle acceptance.
