# CE UAT67 retirement exclusion

A deployment retained its original approval and admission journals after teardown. Public deployment resume could enter F5 reconciliation and admission again.
Teardown needs a durable lifecycle boundary while keeping its own recovery usable.

Public AWS Terraform apply and teardown now share an owner-bound process lock. The selected teardown coordinator persists an immutable retirement marker after
authorization and live prerequisites pass, before token, cloud or platform mutation. Interrupted teardown retains the marker; the same teardown may resume,
while a different teardown binding is rejected. Deployment resume and direct admission reject retirement markers and existing teardown journals. Malformed or
unavailable evidence never grants permission. Preparing a teardown does not retire a deployment.

Focused regressions cover rejection before reconciliation or runner opening, marker persistence before token revocation, interruption/resume, foreign or
malformed markers, real filesystem concurrency exclusion, lock release and cancellation. The coordinated candidate advances to UAT67; source, archives,
installed execution and live acceptance remain separate gates.

No vendor SLI fault, cloud fixture or key is created by this implementation. Supported primary-owner SLI-only control and original publication freshness,
six-interface transition, the full AWS/Azure native/Terraform matrix, producer qualification before repinning, independent cleanup, fleet convergence and
explicit UAT acceptance remain open. Recovery 212977 ms against 45000 ms remains failed; readiness remains false with 288 required rows / 300 blockers. PR1565
stays draft with auto-merge disabled.
