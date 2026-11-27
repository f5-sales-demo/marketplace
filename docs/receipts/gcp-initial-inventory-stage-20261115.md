# Original initial GCP inventory stage

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The initial inventory stage enumerates the owning Terraform plan scope and uses
the authenticated Compute reader and Platform presence issuer. It requires every
declared resource to be absent: 8 resources for the single-node graph or 21 for
the HA observer graph, comprising 17 Compute and 4 Platform resources.

Available raw responses and partial progress are retained before refusal. A
present resource prevents completion. The completed receipt binds its original
bytes and file identity; copied packets, credential rotation, receipt changes
and restored bytes cannot become valid evidence. The original operation budget
and five-minute freshness remain enforced.

Reopening the same process-owned context returns its same stage and cannot reset
a claimed or failed scan. Failure records are retained separately without
rewriting the completed receipt. Idempotent closure waits for pending response
retention and leaves incomplete capture evidence. Presence provides no creation,
bootstrap or execution authority.

Failing-first checks exposed the missing stage and compiled export, context
reopening that created another stage, and missing persistence of a verification
failure. The shared fixture's inferred binding type was corrected before strict
TypeScript 7 verification. Original failure logs remain private.

Six focused stage cases and twelve existing scope cases pass. The compiled API
refuses a serialized scope before authentication or Platform reads. The broader run passes 554 Terraform cases, 665 Platform/GCloud cases, 13 compiled
checks and 13 shared cases. TypeScript 7, three bundles, catalog and tracker
verification pass with the retained candidate hashes.

These are source and explicitly offline fixture checks. Fresh live initial
absences and saved-plan review remain required. Full built-in capture still needs
original insertion/provider/serial/guest composition. All original live GCP
networking/lifecycle/traffic/recovery/cleanup/restoration, remaining installed
checks and review/CI/merge/publication/user installation remain open. No cloud
campaign was submitted by this change.
