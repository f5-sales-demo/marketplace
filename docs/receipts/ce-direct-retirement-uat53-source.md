# CE UAT53 source and archive checkpoint

Source: `6e16de1e67400696b07b559fb252e310dda977db`.

Saved, unsubmitted direct retirement plans resume only after exact configuration, prior/proposed route fields,
state IDs and fresh cloud ownership checks. Submitted restoration and relinquishment attempts use the owning
runner journal and two applied-state observations separated by complete cloud observations. Reconciliation
is persisted before journal advancement. Restoration retains the ordinary no-change gate and exact state IDs;
forgetting retains independent cloud preservation and absence from state. Submitted effects are not replayed.

The source also repairs macOS process locking. The boot-session UUID and locale/timezone-fixed process start
identify a live owner. A failed process query establishes absence only with an independent ESRCH observation.
Equal start times, including same-second PID reuse, conservatively retain the claim. The Linux branch retains
its existing `/proc` identity checks.

## Validation

- Direct retirement: 41 tests and 128 assertions.
- Four-plugin source suite: 1809 tests and 11158 assertions on macOS with Bun 1.4.3 and a canonical temporary path.
- Four compiler checks and runtime builds pass.
- Biome: 352 files checked with no errors.
- Presentation tracker update and check: 478 assertions each; existing evidence retained by reconciliation.
- Runtime assets, public mappings and readiness: 8 tests and 44 assertions.
- Manifests, repository Markdown inventory, staged PII enforcement and diff checks pass.

All four private archives come from the source commit above. Their extracted factories register 38 tools.
The installed bundled Terraform service passes ownership/configuration read, resume and wrong-engine rejection;
the actual public AWS teardown tool rejects a missing plan. This is harness evidence. It does not qualify
installed route recovery, cloud teardown, live preservation, or execution through every supported xcsh runtime.
No checkout-file trace claim is made. The smoke harness initially omitted the required service protocol version;
that task-owned process was terminated, the protocol corrected, and the check rerun successfully.

## Open gates

UAT52's exact head failed CI on formatting in the brownfield regression test. UAT53 repairs that formatting
locally. Ubuntu's home SSH and travel-router jump are unavailable, so no UAT53 push or CI pass is claimed.
The local Podman Linux VM also failed to start because its gvproxy socket was unavailable.

Preparation interruptions before durable saved-plan persistence and replaced restoration-refresh journals
still require recovery work. Missing exact receipts fail closed. Installed public route restoration/cloud
teardown and fresh owned network preservation remain open. Preserve the supported SLI control and original
freshness dependencies, full AWS/Azure native/Terraform matrix, producer qualification before repinning,
independent cleanup, scanner convergence, and explicit UAT acceptance.

The recovery measurement remains failed: 212977 ms versus a maximum of 45000 ms. Readiness remains false with
288 required rows and 300 blockers. PR1565 remains draft; normal publication and UAT delivery remain pending.
