# Original GCP access reader source closure

Issue: #1559. Draft PR: #1698. Engineering acceptance remains incomplete.

All seven concrete access reader adapters now retain their original native
attempt, admission and final capture through a shared source recorder. The
observer and CE compositions retain each actual reader and join its callback,
role and VM identity, including branches with no child execution. Copies,
wrong roles, foreign callbacks and different resource identities refuse.

Immutable access origins join request, actor, executable, arguments, operation
budget and native bootstrap, submission and completion evidence. Admission
refusal can prove physical absence only when no command was submitted. Native
stdin is joined through its sealed snapshot; the source file identity remains
distinct. Failed capture and unresolved locks retain their original meaning.

Native local cases cover successful and nonzero execution, admission refusal,
final capture failure, actual sealed stdin and capture after real operation
expiry. The final child keeps the original budget and owning final reserve.
These source fixtures perform no cloud deployment or SSH authentication.

Validation passes: 67 source and generated-runtime cases with 597 assertions
across four files, plus the corrected observer/source suite with 13 cases and
120 assertions. The wider adapter run retained 45 passing cases and three
observer field-reference failures; the field was repaired and all five affected
observer cases passed. Three full strict plugin typechecks, warning-strict
configured source lint, the normal three-plugin build and catalog checks pass.

Independent review verifies 350 retained files from 30 native captures and
confirms their physical group absences, including admission failures and final
capture after real expiry. Raw evidence remains private.

Candidate versions are GCloud 1.7.71, Platform 6.3.33 and Terraform 2.4.164.
Normal generated artifacts expose the source collectors. This does not prove
ordinary installed tool execution, successful GCP capture, service health,
networking or traffic. No GCP apply was submitted.

Bootstrap publisher and reader handoff, complete durable factory coverage,
remaining startup failures, original provider renewal across expiry, ordinary
Ubuntu `bun dev`, full native/Terraform lifecycle and network acceptance,
independent cleanup, CI, review, merge, publication and published installation
remain required. Historical evidence and immutable v12.3.1 remain preserved.
