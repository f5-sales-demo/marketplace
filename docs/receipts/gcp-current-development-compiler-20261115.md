# Current GCP plugin development compiler

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

GCloud, Platform and Terraform now use the current stable TypeScript 7.0.2
compiler through an explicit `typecheck` script and an exact npm package alias.
Their tar-stream types are updated to 3.1.5. The normal Bun lockfiles include
the authenticated package integrity values and platform compiler packages.

The current qmd 2.8.3 package declares a TypeScript 5.9 peer. Its 5.9.3 dependency
remains separate from the aliased plugin compiler. Verification checks both
installed versions and runs each plugin's script with the TypeScript 7 compiler.
This preserves the upstream dependency contract without introducing a project
compatibility implementation.

All three strict typechecks pass under TypeScript 7.0.2. The source regression
run passes 548 Terraform cases and 665 Platform/GCloud cases; compiled boundary
checks pass 12 cases. Three bundles are rebuilt. Frozen development installation,
catalog consistency and presentation inventory are checked independently.

The first presentation inventory check found its missing dependency environment
in the fresh worktree. The existing validation-runtime lock was installed and the
check was repeated with that changed input. The first alias installation retained
an incompatible ambient compiler for qmd; an explicit 5.9.3 peer pin fixes that
resolution. Both failures remain in the private attempt evidence.

The live runtime tuple remains Terraform 1.17.2, Google provider 8.11.0,
XC provider 15.17.3, Bun 1.4.4 and xcsh 23.10.13, confirmed at upstream endpoints
on November 15. Frozen artifacts and historical receipts remain preserved.

This is development-tool and source verification. Complete built-in capture,
fresh original live networking/lifecycle/traffic/recovery/cleanup/restoration,
remaining installed checks, required review and CI, merge, publication and user
installation remain required. No cloud campaign was submitted by this change.
