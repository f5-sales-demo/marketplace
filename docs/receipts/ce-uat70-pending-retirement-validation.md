# CE UAT70 pending retirement validation

Pending Terraform teardown previously persisted the deployment retirement marker before checking exact authorization, source journal and current owned API
identities. Rejected requests could therefore leave an otherwise active deployment marked as retiring. The coordinator now completes an independent current
observation and validation before persisting the marker, then revalidates before mutation.

Regression cases verify wrong authorization, unknown inventory, substituted logical identity and journal drift cause no mutation and leave no retirement marker.
Existing interruption tests continue requiring the valid immutable marker before token mutation and preserving it for authorized resume. Initial failing
regression retained privately.

Source, archives, installed execution and live retirement remain distinct gates. The exact UAT69 installed failover test additionally proves
retirement/cancellation rejection before provider open using a synthetic serialized Connect plan and real owned storage. This does not qualify live Connect
behavior. No cloud fixture or SLI fault is created. Full acceptance remains false; vendor SLI control/freshness, six-interface transition, complete live matrix,
failed45000 ms recovery, producer qualification/repin, cleanup and fleet convergence remain open.
