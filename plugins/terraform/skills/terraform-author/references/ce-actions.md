# CE lifecycle action plans

The Terraform service exposes `planAction` for one explicit action at a time.
Cloud lifecycle adapters supply site ownership, current readiness, target eligibility,
and subsequent convergence checks. A successful action request does not prove an upgrade completed.

For a separate lifecycle workspace, set `Deployment.stage` and bind the backend to
`local:<deploymentId>:stage:<stage>`. The service retains the deployment owner and
places the stage under restricted deployment storage. Its provider lock and CLI
configuration are independent of the infrastructure workspace.

Supply the exact action address, type, provider source, and SHA-256 of canonical
(sorted-key JSON) configuration values. The runner checks the saved plan for exactly
that invocation. It rejects deferred or unrequested actions, lifecycle triggers,
unknown or sensitive action inputs, mismatched configuration, and resource or output
changes. Ordinary resource plans also reject action invocations.

Apply the returned receipt through the same session. Application rechecks the saved
binary and action identity. Retain ambiguous attempts for observation and recovery;
do not automatically repeat an upgrade after an interrupted apply. Final convergence
requires a fresh ordinary plan with no resource, output, or action changes.

Before invoking an action, the runner persists `action-attempt.json`. Its presence
prevents another action plan or invocation in that stage, including after an ordinary
refresh replaces the plan journal. Older submitted action journals are preserved in
this record before replanning. An interrupted submission requires observation of its
outcome; a new plan does not authorize replay. A distinct, verified upgrade transition
uses a separate stage.

See [HashiCorp action invocation](https://developer.hashicorp.com/terraform/language/invoke-actions)
and the [Terraform 1.16.1 action JSON contract](https://github.com/hashicorp/terraform/blob/v1.16.1/internal/command/jsonplan/action_invocations.go).

For teardown, use `planDestroy` after the cloud adapter verifies ownership of every
resource in the workspace. The runner refreshes state, permits only delete/no-op
changes, and applies the exact saved binary. Preserve the source configuration and
receipts for inspection. Verify empty state with a subsequent refresh-enabled destroy
plan; an ordinary plan against retained source configuration would propose recreation.

Failed Terraform commands retain bounded stdout and stderr in `failure-diagnostics/`
inside the restricted deployment workspace. These files can contain bootstrap or
provider credentials: inspect them locally and export only a sanitized finding.
The executor omits environment variables and returns only a fixed error category.
Successful commands do not create diagnostic files. Retain failed plans and state
alongside diagnostics when reconciling a partial apply.
