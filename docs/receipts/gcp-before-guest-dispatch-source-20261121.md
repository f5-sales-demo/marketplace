# Original before guest-round dispatch source

Issue: #1559. PR: #1698. Scope: source scheduling and native process behavior.

Factory observations now dispatch collection on each initialized original before
worker. Selection checks the source-owned worker registry, original context,
node and actual callback lifetime. Copied workers/callbacks and foreign nodes
refuse. Concurrent scheduling launches one round, preserves failures and waits
45 seconds from the prior round's actual completion before another round.

The source uses the existing original collector and command framing. The final
window, command limits and freshness requirements retain their existing values.
Capture, child closure and retention are attempted independently in the native
fixture so one failure cannot prevent preserving another outcome.

Attempt 1326 failed before implementation. Attempt 1327 then captured a complete
source round with 310 assertions and original natural closure. The fixture input
map lacked an explicit type; attempt 1328 retained that compiler failure.
After the type and fixture retention/concurrency repairs, attempt 1331 passed
eight cases with 775 assertions across four suites. This includes the existing
actual final worker after operation expiry without resetting its reserve.
Strict current Terraform types pass. Independent archive review verifies all
375 files and 1,382,762 bytes across the two current native captures.

These tests execute pinned Python, FIFO and PTY processes against an explicitly
offline native terminal. They prove source scheduling and closure, and do not
qualify GCP SSH, trust, bootstrap journal content or operational health.

Fresh retained timing measures a two-container round at 144,602 milliseconds:
ordinary capture commands take about six seconds and completion discovery about
ten seconds in this fixture. Full 30-container-per-node throughput within the
five-minute final reserve remains unqualified. Limits were not changed.

The factory remains inactive. Source review also found that final observer image
reads reuse the original before-deadline guard. A source-bound final image
mapping, observer/audit correlation, full before/final factory execution and
realistic inventory throughput remain required. This is a current source gap;
it does not establish the cause of q12 or q31.

Supported marketplace installation, ordinary Ubuntu bun dev, original live
guest/bootstrap and all lifecycle/networking/traffic/recovery/restoration
campaigns, independent cleanup, current CI/review, merge and qualified
publication/installed smoke remain open. Historical evidence, unresolved locks
and immutable v12.3.1 assets remain preserved.
