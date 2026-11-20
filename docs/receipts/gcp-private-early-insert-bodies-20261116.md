# Original private early insertion bodies

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Terraform 2.4.116 provides an issuer-only private request/response reader for the
early insertion identity. It verifies the original owning plan and response
source before and after reading, returns immutable strings with their hashes,
and grants no execution authority. Copies and serialized identities refuse.

Changed original output permanently retires both identity and body access,
including after byte restoration. A failed original witness fixture now retains
its executor root and private failure receipt instead of deleting that evidence.

Failing-first source and compiled tests recorded the missing API. An initial
test assertion incorrectly assumed two interfaces in an existing one-interface
fixture; the assertion was corrected and its failure retained. Sixteen focused
checks, 664 Terraform tests, strict typecheck, all three runtime bundles and
15 compiled bridge checks pass. Catalog, shared, privacy and normal commit
validation are recorded separately.

The source uses the current qualified dependency tuple: Terraform 1.17.2,
Google 8.11.0, XC 15.17.3, xcsh 23.10.13, Bun 1.4.4 and TypeScript 7.0.2.
The qmd dependency retains its separately required TypeScript 5.9.3 peer.

These are component checks with explicit offline observations. They do not
qualify a live insertion, VM or guest. Exact operation/numeric-VM/serial binding,
sealed initial-baseline integration in the VM join, observer insertion mapping,
built-in capture and every original live, installed and delivery gate remain
open. Historical evidence, unresolved locks and immutable assets remain preserved.

The shared validation fixture now selects xcsh 23.10.13 with a frozen lock,
aligned with the current GCP development runtime. All 26 controlled workflow
checks and 13 shared tests pass; catalog and presentation validation pass with
the current runtime version. Dependency installation hooks were disabled.
