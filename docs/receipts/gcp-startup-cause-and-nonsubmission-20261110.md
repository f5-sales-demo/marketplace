# GCP pre-submission failure and startup cause evidence

Issue: #1559. Delivery: draft PR #1698.

The latest source qualification was not submitted to Terraform. Cloud Logging
returned a complete 429 RESOURCE_EXHAUSTED response to its scoped audit read in
the capture startup callback. The response identifies RATE_LIMIT_EXCEEDED for
read requests: 120 per minute per project. This service quota is independent
of cloud spending authorization. No quota setting or capture requirement changed.

The original executor's durable completion records submitted=false, natural gate
exit 73 and group closure. The reader retained zero observations, so its capture
remains failed. This attempt does not resolve the earlier descriptor permission
failure or establish CE lifecycle acceptance.

An independently reviewed disposition preserved the failed workspace and locks.
A separate workspace containing the identical configuration produced an empty
destroy plan and two resumes without submission. Independent reads confirmed all
14 original and verification process groups absent, original state absent and
retained lock bytes unchanged. No cloud resource changed.

Startup callback errors previously became a generic startup refusal without
retaining their original cause. The executor now writes private, immutable
callback and deadline diagnostics with original identity, time, message and
stack. Late callback failures remain separate from the deadline and reach final
capture after that same callback settles. The original reserve does not reset.
Persistence errors preserve both the startup cause and the persistence failure;
the failed claim remains held. Public results contain no raw diagnostic text.

Verification: three failing-first tests; all 27 executor regressions pass.
All 1,328 shared and canonical tests pass under sleeping cloud CLI stubs, with
33,918 assertions. Three native typechecks and runtime builds, dependency and
manifest validation, Biome and staged privacy checks pass. The canonical tracker
preserves 2,678 tasks, 315 surfaces, 22 plugins and historical receipts.
Passing CI at the new source head remains required.

Full installed capture, original provider lifetime/access, token refresh across
expiry, complete native/Terraform acceptance and delivery remain open.
