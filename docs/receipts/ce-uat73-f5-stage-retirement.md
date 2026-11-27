# CE UAT73 F5 stage retirement

The owning Terraform service now exposes internal F5-stage artifact retirement. The caller remains responsible for independently qualified complete cloud/F5 absence and its evidence digest. Empty bookkeeping alone does not prove remote absence.

Retirement verifies full deployment ownership, original authorization, exact empty bookkeeping, no pending cancellation and the shared stage template. It requires a new ordinary no-change plan, persists its identity-bound receipt before removal and revalidates bookkeeping. The existing runner verifies empty local state and removes private artifacts. Interrupted cleanup resumes from the
same receipt without replanning; foreign or changed checkpoints reject before session opening.

F5 resource writes, reconciliation and direct cancellation reject a stage retirement checkpoint. Resource execution, cancellation and retirement now use the same stage template, provider lock and backend identity.

Six focused tests and 101 assertions pass. A regression reproduced checkpoint validation after session opening; validation now precedes opening. Real Terraform 1.16.5 with the existing XC provider 15.12.1 lock retired an empty local stage, retained only its manifest and retirement marker, resumed identically and rejected late planning. No cloud/F5 resource was created; this is local
owning-service evidence.

Public AWS teardown integration, complete external absence, other stage retirement and parent sensitive-journal retirement remain open. The failed 45-second restoration criterion, vendor SLI control/freshness and full live matrix remain unresolved. All four candidate plugins advance to UAT73; publication and explicit UAT acceptance remain separate gates.
