# Original GCP apply stdout and transport

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The existing installed invocation compiler selects Terraform JSON UI and
`-parallelism=1` after exact owning runner admission. The runner retains its raw
command and original plan source. The handoff is verified without changing the
saved plan, engine, resource identities or authorization. The Google lifecycle
and HTTP trace mapping continues to require serialized RPCs.

The apply hook parser now consumes original executor-issued stdout records and
requires their exact completion, contiguous offsets and stream hash. Its source
accessor verifies the current original output again, including both channel
hashes, executor identity, reviewed plan, event time and line hash. Plain parser
candidates, copied records, wrong channels, replay, mixed input and copied
completion references cannot obtain descriptor authority. Hook provenance does
not qualify a provider RPC, create ownership or bootstrap execution.

Failing-first checks also exposed impossible calendar dates accepted through
JavaScript date coercion. UI timestamps now use the shared strict RFC3339
validator. Original failure logs remain retained. Source verification passes 570 Terraform cases, 665
Platform/GCloud cases, 15 compiled checks and 13 shared cases. TypeScript 7,
three bundles, catalog and tracker checks pass.

A real Terraform 1.17.2 runner probe created and removed two local
`terraform_data` records with the qualified transport. Eight original create and
destroy hooks were retained and verified. Independent kernel and SDK review
confirmed all 26 command groups absent, empty state, empty destroy and no
unresolved executor lock. The original two-hour deadline remained fixed across
cleanup. Zero cloud resources were created.

The first probe used the wrong cleanup method. Its cleanup continuation then
exposed a transport syntax error and use of preparation where resume was
required. Those attempts remain private. The corrected continuation joined the
exact original local IDs and state hash, resumed the same owner and budget, and
completed typed cleanup without another create submission.

Broader tests exposed a duplicate tracing change at the wrong runner layer.
That change was removed. The restored runner-to-compiler handoff and a fresh
native compiler-path probe are verified separately; the initial failures remain
retained.

These are component, source and compiled API checks. Full built-in insertion,
provider, serial and guest composition; original native/Terraform live acceptance;
remaining installed checks; review/CI/merge/publication and user installation
remain required. Ordinary installed tools and cloud authentication are not
qualified by this local probe.
