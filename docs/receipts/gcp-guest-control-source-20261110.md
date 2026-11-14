# GCP guest control framing and source dispatch

Issue: #1559. Delivery: draft PR #1698.

The guest capture path now has a bounded original-session control channel and
parent-verified dispatch around the existing real SSH Site CLI session. Frames
bind the session nonce and strictly ordered sequence. Oversized, interrupted,
duplicate-key, foreign and timed-out frames permanently retire the channel.
Only declared capture, completion discovery and original-session closure are
accepted; arbitrary command strings and malformed container identifiers refuse.

Parent guard requests bind the original VM, observer, token, interfaces and SSH
input tuple. The exact original response must approve its matching guard and
identifier. A boolean identifier cannot impersonate an integer request ID.
Failed guards retire capture. The fixed original close reserve remains available
after operation expiry for input checks and closure; it cannot authorize more
cloud capture or renew its deadline. Guest dispatch snapshots the original methods,
refuses replaced bindings and preserves incomplete or truncated evidence.

The source factory uses the shipped real SSH PTY without a conversational
transport override. Offline tests exercise the wire and source contracts; they
do not qualify live SSH, GCP guest behavior or installed runtime acceptance.
All seven shipped capture scripts now participate in generated source hashes
and installed admission. Missing or modified scripts remain prerequisites.

The Python capture/control/PTY suite passes 60 tests. Related installed source,
provider-reader, final-reserve and controller checks pass 33 tests with 134
assertions. Native builds, three typechecks and source lint pass. The 1,352 shared/canonical
tests pass with 10,897 assertions; all tracker history remains retained.

The native parent-process connection, full original provider/VM/token/NIC/serial
joins and default installed capture factory remain incomplete and held.
Complete bootstrap/VPM/container logs, original expiry, networking/lifecycle,
ordinary installed Ubuntu bun dev, review, publication and published installation
remain required. The separate live expiry campaign keeps its original process,
source bytes and deadline. No GCP managed resource was created for this change.
