# CE UAT65 pending admission retirement

Interrupted Terraform admission can leave a logical site and bootstrap tokens before physical registration. Public `aws_ce_teardown` now selects a distinct immutable pending-
admission plan from the exact owning authorization and admission journal. The new path remains single-node and non-HA.

Preparation requires complete stable API inventory, deterministic node-bound token names, exact token and logical UIDs, original site checkpoints and owning F5 Terraform state.
Apply revokes exact tokens, retires cloud resources through the existing guarded saved-plan workflow, then deletes the exact logical site through Terraform-owned F5 execution.
Resume permits already-removed planned identities and reconciles only a selected pending F5 delete. New identities, journal drift, physical registration, unknown evidence, or
pending F5 creation/update block further mutation. Empty logical API evidence cannot substitute for empty F5 state bookkeeping.

Validation passes 1940 four-plugin tests / 11693 assertions, platform/AWS compiler checks and four runtime builds. All four versions advance together to UAT65. Installed public
execution, real pending-admission retirement, bounded interruption/resume, independent provider/cloud/API cleanup and sensitive staging retirement remain qualification gates.

UAT64 plugin CI 39592566302 failed because the platform test fixture cast changed after tracker generation. The committed platform fingerprint was independently reconstructed and
matched the cast-fix difference. UAT65 regenerates the canonical tracker after all plugin edits and builds are complete. Retain the UAT64 failure and historical archive receipts.

Readiness remains false: 288 required rows / 300 blockers. Recovery 212977 ms against 45000 ms remains failed. Vendor SLI control/freshness, six-interface transition, complete
matrix, producer qualification, fleet convergence and explicit UAT acceptance remain open. PR1565 stays draft with auto-merge disabled. No full UAT delivery or normal CE
publication.
