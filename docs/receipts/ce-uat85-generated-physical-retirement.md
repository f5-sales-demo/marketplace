# CE UAT85 generated physical retirement

Exact installed UAT84 reconciled the submitted logical site, then pending inventory rejected a present physical site. Independent read-only inspection found matching ownership labels, a distinct physical UID, creator class akar, CUSTOMER_EDGE, WAITING_FOR_REGISTRATION and zero main nodes. Registrations, tokens and routing/ingress collections were empty.

A separate pre-registration collector records stable logical and physical identities across two complete scope reads. It rejects registered nodes, changed or foreign objects, another creator class, nonwaiting state, partial collections and service failures. The original physical-absence collector retains its strict contract.

Pending teardown binds both UIDs into the immutable plan, rejects physical substitution before mutation and requires a physical retirement observer before action. Owning logical-provider deletion is followed by exact logical/physical/registration deletion observation.

Physical lag stays pending; resume does not replay logical deletion. Missing admission provenance and the single non-HA boundary remain enforced.

Collector and coordinator regressions fail before implementation. Focused verification passes 33 tests and 233 assertions. Full verification passes2049tests/12508assertions;fourcompilers/builds,tracker478/action,assets8/44 and manifests pass. All four plugins advance together to UAT85.

Exact archive source `4e0d3c664a9759ff08bbd1ab9ba38203d9d2799d` passes plugin CI39642953493 and lint39642954105. Installed public terminal teardown and repeat pass on xcsh23.8.0,23.9.3 and23.9.5 with the source checkout unavailable. These terminal fixtures use synthetic cloud/API absence.

Exact archive-installed public teardown and repeat on xcsh23.9.3 return deployment-artifacts-retired for the retained failed UAT80 fixture. Independent live checks verify ten saved
cloud IDs absent, logical/physical404, empty registrations/tokens/routing/ingress, no generated interfaces for the original owner, and runner/parent artifact retirement. Both
preserved final refresh-enabled Terraform receipts report no changes.

Strict empty ownership inventories remain open: both AWS tag APIs still list one deleted subnet, while exact DescribeSubnets returns InvalidSubnetID.NotFound. The public absence
collector checks extra tagged IDs and verifies deletion; that result does not satisfy the stricter empty-inventory criterion. The initial independent assertion failure remains
preserved. No bootstrap, registration, interface readiness or complete live CE acceptance is established by this cleanup.

Full UAT, interface control/freshness and transition, failed 45000 ms restoration, producer qualification/publication, fleet convergence and explicit acceptance remain open. PR1565 stays draft with auto-merge disabled.
