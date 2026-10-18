# GCP installed and live acceptance

Current status: discovery/readiness, owned observations and narrow native teardown.
Native and Terraform deployment,
bootstrap, upgrades, repair, replacement, failover, interruption recovery,
restoration and Terraform teardown remain unavailable through public tools.
Full parity is unclaimed.

Installed native teardown qualification used six synthetic Compute identities
and a live disposable XC site and node-bound token. The typed tool saved a review,
applied its exact approved hash and verified absence; independent API reads
confirmed both XC objects absent and private staging was removed. Automated
tests cover lost-response recovery after review expiry, no repeated deletion,
replacement rejection and reappeared site/token rejection. Installed live GCP
cloud teardown remains a separate acceptance gate.

Disposable qualification established single-node boot, ONLINE registration and
both physical NIC joins for native and Terraform. Later native and shared
Terraform runner campaigns observed matching-node `PROVISIONED` global health
after initial software/OS convergence and completed owned cleanup with independent
absence checks. The runner recorded one healthy sample; sustained health remains
unqualified. Initial convergence is separate from explicit upgrade acceptance and
the 120-second recovery requirement. These results do not enable public lifecycle
tools or qualify HA, routing, application traffic, replacement, repair or failover.

Fresh installed prompts must route GCP CE requests to this skill and typed tools,
preserve explicit Terraform choice, reject wrong-engine requests and report
unavailable gates without generic CLI fallback. Cloud provisioning must never
be reported as registration, physical identity, routing or traffic acceptance.

After qualified contracts and runtime integration, use task-owned disposable
resources in Montréal (`northamerica-northeast1`) and available zones. Review
concrete plans before required approvals. Qualify both engines with single-node
and three-node HA, isolated SLO/SLI networks, owned clients and origins, supported
routing profiles, content-verified traffic, serial upgrades, replacement, repair,
failover and interrupted recovery. Route and application recovery must each
complete within 120 seconds; record loss and convergence separately.

Finish native campaigns with reconciliation and Terraform campaigns with a fresh
zero-change plan. Apply only exact reviewed saved plans with pinned providers,
state locking and isolated state. Teardown requires ledger ownership and
restoration inventory; independently check absence afterward. Brownfield
restoration requires automated coverage. Publish immutable artifacts only after
review/CI and applicable acceptance, then verify fresh installed published tools.
