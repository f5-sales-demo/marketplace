# Durable GCP capture cleanup source qualification

Issue #1559 remains open. These source tests use synthetic GCP/XC observations
and real private files, shared storage and runner checks. They do not qualify
real GCP ownership, guest-reader closure, deployment behavior or publication.
The complete capture factory remains inactive.

Platform storage now publishes immutable byte snapshots with original file and
parent identities. Identical write collisions refuse. Mutable storage methods
cannot overwrite or remove these records. Restart reads reject same-byte file
replacement, symlinks and another deployment owner.

The GCP publisher retains its original state, create checkpoint, saved binary,
ownership evidence and reader-input bindings. Reviewed destroys retain their
pre-action state and original plan. Resume checks these immutable records and
current cloud/XC ownership without invoking Terraform or submitting an action.

A partial applying destroy requires a new reviewed plan and cannot replay the
original applying receipt. Completed cleanup can retain an independently
observed effect proof without rewriting the applying journal or claiming the
original command was observed. That verification scope refuses every apply.
Original empty cleanup retains its serial and supports two read-only resumes
behind a stable empty destroy. Credential rotation at the same endpoint does
not change the owning context; a changed destination refuses.

Verification:

- a1786/a1793: missing immutable storage and durable admission APIs fail before
  implementation.
- a1788: original immutable snapshot, owner, replacement, collision and concurrent
  writer cases pass with the existing shared storage checks.
- a1807: 61 affected cases and 272 assertions pass, including original/partial/
  completed recovery, stale and future reviews, concurrent resumes and rotation.
- a1812: a separate Bun process reconstructs persisted original admission
  without Terraform execution. Observations remain synthetic source fixtures.
- a1818: durable original empty state supports two non-submitting resumes and
  refuses invented serial changes.
- a1814: the actual generated runtime export test fails before its export repair
  and normal three-plugin build.
- a1827/a1829: a genuine setup failure leaves a transient admission active in the
  initial publisher. The repaired failure boundary retires it before returning.
- a1832: all 182 affected cases and 973 assertions pass across 11 files, preserving
  the original runner, HA/observer ownership and cleanup checks.
- a1833/a1834/a1835/a1836: current strict Terraform, GCloud and Platform typechecks
  and configured source/generated-runtime lint pass.

All failed attempts remain retained privately. No source test creates cloud
resources. Original factory reader-group evidence and real GCP/XC observations
remain required before fresh cloud acceptance. The retained fresh 21-resource
create plan has not submitted apply; authentication, source IP, scope and initial
absences require revalidation. Every original installation, ordinary Ubuntu bun
dev, full lifecycle/network/content-traffic/recovery/restoration, CI/review and
delivery gate remains open. Historical executors, failed locks and immutable
v12.3.1 assets remain preserved.
