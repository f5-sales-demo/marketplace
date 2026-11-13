# Latest Terraform and provider capture qualification

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempts: 414 through 417. Full issue acceptance remains incomplete.

New deployments select Terraform 1.17.1, Google 8.10.0 and XCsh 15.15.6.
Official release metadata, signed checksums and registry metadata authenticate
the artifacts. Standard Terraform initialization, cross-platform provider locks,
validation and actual provider schemas pass. Existing stored deployments resolve
their original exact version tuple, configuration and lock bytes. Unknown,
mixed or modified profiles refuse; historical receipts are not migrated.

The bundled Linux user installer also selects the authenticated Terraform 1.17.1
archive and executable. A failing-first pin regression and five installer safety
cases pass. Actual isolated user installation returns the expected executable
digest, and its version command reports 1.17.1 with outdated=false. Existing
foreign or older binaries are preserved and require an explicit upgrade path.

The installed provider reader now collects bounded 45-second observation windows
through the original executor's stderr FIFO. Source-issued witnesses retain the
original PID, start, boot identity, executable and descriptor identity. Separate
readiness and completion results preserve the original startup and operation
deadlines. A later window cannot renew the two-hour operation budget. The Python
source loader compiles admitted source bytes rather than adopting cached
bytecode; a public bytecode regression demonstrates the original defect.

Lifecycle, forwarded HTTP and Terraform UI parsers select only authenticated
version profiles. Provisioner events additionally require original JSON
configuration bytes matching the reviewed plan digest. Declared provisioner
types, order, create or destroy phase and active resource identity must match.
Unpaired, foreign, concurrent, replayed, truncated or unknown events refuse.
Progress output remains opaque and exposes only its digest. Error events retain
failure even when a subsequent action completes. Root JSON declarations are
supported; module expansion and other configuration forms require a separately
qualified mapping. These candidates grant no execution authority.

Validation passes 45 focused parser cases and the combined shared suite of
1,056 tests and 4,788 assertions. All three native typechecks and runtime builds
pass. The canonical tracker passes 80 tests and 1,131 assertions, retaining 2,678 tasks
and 315 surfaces across 22 plugins. Dependency, Biome, Python lint/type/format
and staged privacy checks pass. Normal commit hooks and delivery are recorded
separately.

A fresh standard-runner fixture used the actual latest binaries, compiled
installed reader, default executor and kernel clock. Its first full window
completed while the original Terraform process was alive. The second window
retained the same original Google provider and FIFO and observed executor
closure. Both lifecycle and HTTP records joined by original request ID, plan and
record hashes. All 9,711 trace records were retained. The fixture passed
no-change planning, reviewed typed teardown, empty destroy, stable empty state
and two resumes without submission. Independent inspection verified all 28
executor and reader groups absent. The source receipt digest is
`7b68fdbb92559e01584c3305cd0fa710dd92f93a719dc2d44e5609ed6beca3da`;
the independent cleanup digest is
`9ec434a770d834b4723b4679a6d54387e129e0cf26ce05b0d279c39d93c6865c`.

The reviewed scope contained one local Terraform builtin create and one Google
zones read. It created zero managed cloud resources and made zero cloud
mutations. Synthetic CE scope and unused Platform fields were not applied.
All process, apply RPC and original insert qualification flags remain false.
The 55-second fixture does not prove credential refresh across expiry.

The earlier long-window fixture remains failed because its parser did not admit
provisioner events. Independent recovery retains its failed flags and original
locks, with empty state and 23 process groups absent. New helper preflight
failures were corrected through explicit changed inputs before Terraform
execution; their evidence remains private. The first broader test invocation
selected an interpreter without the required isolated Python dependencies; its
failures are retained and the replacement explicitly selects the documented
development interpreter. No production guard or deadline was weakened.

The default full installed GCP capture remains unavailable. Managed reviewed
action, request, audit, operation and original numeric incarnation joins,
same-original-provider expiry refresh, complete guest capture, native and
Terraform lifecycle, networking, traffic, recovery and restoration remain
required. Ordinary installed Ubuntu runtime, required review and CI, merge,
qualified publication, verified downloads and published installation remain
open. Frozen collectors, immutable v12.3.1 and q12's unknown cause are preserved.
