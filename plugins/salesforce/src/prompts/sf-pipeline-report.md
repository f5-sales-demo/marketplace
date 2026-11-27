# sf_pipeline_report

Generate a read-only Salesforce pipeline report using the selected organization, verified current user and private mappings reviewed during `xcsh plugin setup salesforce`.

Default coverage is opportunities owned by the authenticated user or listing that user as a team member. Overlap is deduplicated. Missing team access is reported as owner-only coverage. Person-profile IDs and inferred territories never expand report scope.

Opportunity totals use `Opportunity.Amount` unless a different numeric field is confirmed. Product totals use supported `OpportunityLineItem.TotalPrice` or a confirmed line-item mapping and remain separate from opportunity totals. Configured exact-value or prefix rules define product groups. Unmatched or ambiguous products remain Uncategorized and included in totals. Quota eligibility requires an explicit group choice; never infer it from product names.

Fiscal periods come from the selected org. Missing periods leave period bookings unavailable. Open pipeline covers all open opportunities. Renewal meaning is optional and must be confirmed; until then all open opportunities remain in open pipeline. Amounts in different currencies stay separate. Missing amounts, failed queries and incomplete pages never imply verified zero.

## Parameters

- `target_org` (optional): Salesforce CLI alias or username. Otherwise use the CLI effective project/global default. Identity is resolved and pinned for the operation.

This tool reads configuration and Salesforce records; it never writes configuration, records or metadata. Re-run reviewed plugin setup to refresh schema and optional mappings. Preserve unknown and partial coverage in any summary.
