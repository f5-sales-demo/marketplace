# GCP provider window bridge source qualification

Issue #1559 remains incomplete. These checks use real descriptor/window issuers
with explicit offline provider logs and clocks. They do not qualify Google
execution, installed runtime behavior or live GCP traffic.

Attempt 1234 reproduced rejection of a 70-second RPC whose full interval was
covered by two overlapping 45-second observations. The source now verifies the
same original executor, provider PID, start, boot, executable and FIFO before
merging conservative paired-clock ranges. An RPC must fit entirely inside one
continuous merged range. A one-millisecond gap remains refused.

Each reader retains its existing observation and command limits. Source checks
still reject clock jumps, copied windows, identity/FIFO changes and evidence
replacement followed by original-inode restoration. The restoration fixture
uses ordinary private-directory renames; it does not write read-only evidence.
Failed earlier attempts remain preserved.

Multi-window correspondence uses schema version 3 and retains all original
window hashes plus its conservative coverage ranges. Single-window evidence
retains schema version 2. Historical receipts and immutable artifacts are not
rewritten. Correspondence still grants no apply or insertion authorization.

Verification:

- Attempt 1240 passes 66 descriptor, clock, provider and lifecycle cases with
  330 assertions across four files.
- Normal three-runtime build, strict Terraform types and catalog checks pass.
- Attempt 1242 independently verifies 160 retained files across 30 archives
  against their hashes, sizes and private file properties.

The complete factory still needs original inventory/bootstrap/provider/VM/
observer/CE/guest stages and their final/closure dependencies. Remaining expiry
and source renewal behavior, realistic full-inventory throughput, supported
installation, ordinary Ubuntu `bun dev`, fresh reviewed live campaigns and
independent cleanup, current CI/review and qualified publication remain open.
