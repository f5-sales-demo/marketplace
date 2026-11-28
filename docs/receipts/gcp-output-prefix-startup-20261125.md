# GCP output prefix checks during startup

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

The full source startup probe produced no startup-qualified proof. The native
actor exited at its startup deadline before the xcsh reader established readiness.
The reader retained the missing original parent error. Independent disposition
verified no native apply submission, 21 resource absences and 13 native group
absences including the nested reader. The consumed checkpoint, failed capture
flags and unresolved executor lock remain preserved.

Inventory binding reads the original native output prefix. Its lifetime guard
repeated full installed input checks during startup. Prefix inspection now uses
the existing continuous identity checks after original output admission. Full
digests remain at admission, command release and final capture. Interpreter,
executable, generated inputs, file and parent identities, original descriptors,
output prefix bytes, watcher refusals and deadlines remain checked. Callers
without an identity verifier retain full checks for prefix inspection.

## Verification and remaining acceptance

Two native regressions failed first and passed after the change. They verify
identity checks during prefix inspection, refusal before command release on
identity change, and retained full release and final checks. Attempt a2517
passed 116 affected cases with 763 assertions covering native execution,
output, original inputs, prepared scope, inventory, bootstrap, coordination and
final capture. Strict Terraform types, normal runtime build, configured lint,
privacy enforcement and diff checks passed.

Full source startup requires a distinct fresh qualification scope. No cloud
apply was accepted. The complete factory remains inactive. Original guest
capture, same-original-provider renewal across expiry, all requested native and
Terraform lifecycle, networking, traffic, recovery and cleanup acceptance,
required CI and review, merge, publication and published installation remain open.
The 15-second startup, 60-second commands, two-hour operation deadline and separate
five-minute final reserve remain unchanged. Historical assets remain preserved.
