# Original VM queue source qualification

Issue: #1559. PR: #1698. Scope: source composition only.

The factory adapter orders admission, reconciliation, serial capture and packet
reads over the same original VM source. Its final transition now verifies the
source-issued callback, reader, inventory and directory before sealing the queue.
Invalid or copied admissions cannot retire valid before work. Pending operations
drain within the unchanged original final reserve; late before calls refuse.
Identity replacement and restoration retain the raw source's permanent refusal.

Failing-first attempts 1279 and 1285 reproduced invalid-admission poisoning and
the missing bounded-wait helper. Attempt 1278 did not install its test because
of a command quoting error; that failure remains retained separately.

Attempt 1287 passed 21 cases with 102 assertions across the queue, raw VM and
factory preflight/failure suites. Current Terraform types and repository Biome
checks passed. Attempts 1291 and 1292 passed all five queue cases and retained
four original-source VM event archives. An independent reviewer verified all
25 files and 38,285 bytes against their immutable hashes and private file
properties. A separate review verified the 224-file factory failure archive.
The original failed-start source and unresolved closure refusal remain preserved.

Both hosts independently renewed Google CLI credentials and verified the expected
active project. This establishes CLI authentication only; deployment ADC and
refresh through the original Google provider remain separate live gates.

The complete factory remains a draft and is absent from the default installed
resolver. Its positive before/final execution remains unqualified. Investigation
also found absent before guest-round dispatch, single-window insertion-witness
composition and missing integrated UI, HTTP and audit joins. Full inventory
throughput, supported installation, ordinary Ubuntu bun dev, original GCP guest
and lifecycle/networking behavior, traffic/recovery/restoration, independent
cleanup, current CI/review, merge and publication/installed smoke remain open.
Immutable v12.3.1 and historical evidence retain their existing holds.
