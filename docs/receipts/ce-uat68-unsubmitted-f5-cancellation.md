# CE UAT68 unsubmitted F5 cancellation

A pending original F5 site create/update previously blocked teardown preparation when no apply had been submitted. The general reconciliation path could execute
the request, which did not meet cancellation intent. A separate typed cancellation operation now verifies the complete prior owner state and API UID/spec,
restores only the prior desired configuration without apply and requires unchanged readbacks plus a bound refresh-enabled no-change plan before clearing the
pending request.

The owning runner independently rejects applying/applied journals and changed saved-plan evidence. It persists cancellation provenance before configuration
revision, archives and retires the exact original saved plan and supports interrupted revision/plan-retirement recovery. A durable in-progress cancellation
marker blocks ordinary F5 resource execution and public AWS deployment resume until cancellation bookkeeping is complete. The same cancellation may resume after
refresh or marker-removal interruption.

Public pending-admission teardown preparation invokes cancellation only for the selected original site POST/PUT with the exact owner, source plan and request
coordinates. Submitted requests continue through observation-only reconciliation. Missing, malformed, foreign or unproven evidence remains unresolved; the
single-node/non-HA mutation guard remains unchanged.

Source validation and exact archive/installed execution are recorded separately. Synthetic API/runner tests do not qualify live CE interruption/resume or
cleanup. No SLI fault is introduced. Supported primary-owner SLI control and original publication freshness, six-interface transition, full AWS/Azure
native/Terraform matrix, producer qualification before repinning, independent cleanup, fleet convergence and explicit UAT acceptance remain open. Recovery
212977 ms against 45000 ms remains failed; readiness remains false with 288 required rows / 300 blockers. PR1565 stays draft with auto-merge disabled.
