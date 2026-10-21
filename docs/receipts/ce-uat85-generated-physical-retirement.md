# CE UAT85 generated physical retirement

Exact installed UAT84 reconciled the submitted logical site, then pending inventory rejected a present physical site. Independent read-only inspection found matching ownership labels, a distinct physical UID, creator class akar, CUSTOMER_EDGE, WAITING_FOR_REGISTRATION and zero main nodes. Registrations, tokens and routing/ingress collections were empty.

A separate pre-registration collector records stable logical and physical identities across two complete scope reads. It rejects registered nodes, changed or foreign objects, another creator class, nonwaiting state, partial collections and service failures. The original physical-absence collector retains its strict contract.

Pending teardown binds both UIDs into the immutable plan, rejects physical substitution before mutation and requires a physical retirement observer before action. Owning logical-provider deletion is followed by exact logical/physical/registration deletion observation.

Physical lag stays pending; resume does not replay logical deletion. Missing admission provenance and the single non-HA boundary remain enforced.

Collector and coordinator regressions fail before implementation. Focused verification passes 33 tests and 233 assertions. Full verification passes2049tests/12508assertions;fourcompilers/builds,tracker478/action,assets8/44 and manifests pass. Source verification is distinct from exact installed execution and live cleanup, which remain pending. All four plugins advance together to UAT85.

Full UAT, interface control/freshness and transition, failed 45000 ms restoration, producer qualification/publication, fleet convergence and explicit acceptance remain open. PR1565 stays draft with auto-merge disabled.
