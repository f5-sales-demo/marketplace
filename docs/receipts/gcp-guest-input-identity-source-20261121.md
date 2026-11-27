# Original guest input identity and native inventory throughput

This receipt qualifies source behavior for issue #1559. Complete factory,
supported installed runtime, real GCP and delivery acceptance remain open.

## Measured problem and change

Fresh native captures took roughly six seconds and completion discovery ten
seconds (a1434). Journal fsync measured about 0.6 ms (a1454), while each full
hash of the 33.9 MB interpreter took about 69 ms (a1455). Source review found
full input hashing before and after every control frame.

The actual source-admitted native entry probe observed 30 input rereads during
two frame checks; a1459 failed at that expected assertion. The original failed
receipts remain private and unchanged. Earlier a1457/a1458 failed during fixture
setup because the original and copied module directories differed; those are
fixture failures, not proof of the performance regression.

The entry now keeps continuous no-follow file/descriptor/parent identity checks
between full verification boundaries. Only a source-admitted entry can use this
path; copied entries refuse. Full source hashes and captured module bytes remain
required at admission. The installed parent continues full input hashing before
and after commands and at final capture/closure. Changed or restored contents,
replacement, symlink and replacement during open remain refused. No timeout,
freshness, ownership or coverage condition is relaxed.

## Verification

- a1467: all 99 affected Python entry, control, worker, session and PTY cases
  passed. a1470/a1471: repository-configured Pylint and mypy passed; Ruff passed.
- a1472: normal three-plugin runtime and shipped source-pin build passed.
- a1476: current strict Terraform TypeScript passed.
- a1477: three actual native Python/FIFO/PTY workers retained all 90 container
  inspections and 90 full logs. Collection completed 175,603 ms after the
  original final start, inside the unchanged 300,000 ms reserve. Each node
  captured 30 containers in 169,215 to 170,462 ms. All workers had one submission,
  independent original group closure and exit code zero.
- a1479: 13 source cases and 786 assertions passed across five files, including
  current before/final capture, original callback retirement and source/schema
  refusal. Before capture took 27,612 ms and final composition 43,507 ms.
- a1478: 3 native inventory archives, 1,689 files and 5,842,851 bytes were independently hash verified.
- a1480: 2 current regression archives, 375 files and 1,382,760 bytes were independently hash verified.

The native replies and bindings are explicit offline fixtures. Their reports
retain guestAcceptanceComplete false and bootstrapCoverageVerified false.
This demonstrates shipped-source inventory throughput, not real CE SSH trust,
registration, bootstrap health or application traffic.

## Remaining acceptance

Positive full eight-stage factory execution and real CE/observer binder handoff
remain required. Real GCP ownership/token/NIC/bootstrap/journal/container joins,
shared source renewal/concurrency, interruption and cleanup must still pass.
The inactive factory/bootstrap drafts are preserved outside this source commit.

Supported marketplace installation, ordinary Ubuntu bun dev with the configured
model and actual registered tools, native/Terraform single-node and HA lifecycle/
network/content traffic/recovery/restoration/teardown, current-source CI/review/
merge, qualified publication and published installation remain open. No cloud
resource was submitted in these source continuations.

## Package qualification

The normal package hook sets Terraform to 2.4.155. The normal versioned
three-plugin runtime build, current shipped-entry hash in the exact staged
artifact, compiled import/refusal smoke, canonical catalog and staged PII/
redacted secret scans pass (a1484 through a1490). Current source lint passes.
The staged artifact excludes the preserved bootstrap-only draft hunk; factory
and bootstrap drafts remain inactive and separate. Publication and normal
installed runtime acceptance remain unfinished.
