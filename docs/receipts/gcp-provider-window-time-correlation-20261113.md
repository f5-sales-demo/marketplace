# GCP original provider window time correlation

Issue: #1559. Full acceptance remains incomplete.

The installed provider reader now retains paired epoch and monotonic clock
samples before and after each original window. Clock access requires the exact
reader-issued window and rechecks its original file. Copied or replaced evidence,
reversed clocks, excessive sampling uncertainty and offset changes refuse.
Clock failure remains permanent. Offline clocks require an explicit test executor.

Original descriptor RPC correspondence now checks that provider start and exit
times contain the independently observed process samples. The complete RPC
receive/serve interval must fit an observed window using conservative clock
bounds. Intervals outside those bounds refuse. Correspondence schema 2 retains
false provider, apply and insertion qualification flags.

Failing-first tests exercise exact window issuance, changed evidence, clock
jumps, valid RPC correspondence and intervals outside observed times. Descriptor
fixtures use real original output handles with simulated provider logs and
process windows; they do not qualify live Google execution. Endpoint clock
samples do not prove unseen clock behavior or continuous provider lifetime.

The focused suite passes 45 tests. The complete family passes 1,341 tests with
6,548 assertions. Terraform TypeScript 5.9.3 and three runtime builds pass.
The current local expiry probe remains separate evidence and requires final
capture, original process closure and independently reviewed typed cleanup.

Builtin capture composition, normal installed Ubuntu `bun dev`, all native and
Terraform GCP guest, networking, lifecycle, content traffic, recovery and
restoration acceptance, review, CI, merge, publication and installation remain
open. No GCP deployment is qualified by this source receipt.
