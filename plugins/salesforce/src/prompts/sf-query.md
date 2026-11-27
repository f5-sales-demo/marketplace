# sf_query

Execute read-only SOQL in one authenticated Salesforce organization. Provide a short `description` of the query's purpose. Use `sf_pipeline_report` for personal pipeline, bookings and forecast summaries.

## Parameters

- `query` (required): SOQL text.
- `description` (optional): short purpose label, such as "Account candidates".
- `target_org` (optional): Salesforce CLI alias or username. Otherwise use the effective project/global default.
- `use_tooling_api` (optional): use the Tooling API for metadata queries.
- `all_rows` (optional): include deleted records.

Registered queries resolve and pin the organization and authenticated user before executing. Setup and authentication failures direct the user to `xcsh plugin setup salesforce`. Tools do not change authentication or private configuration.

## Schema and business meaning

Use `sf_describe` to confirm object and field names, types, picklists, relationships and query capabilities in this org. Confirm every custom field before querying it. Field existence does not establish business meaning: revenue, renewals, territories, product groups and quota eligibility need reviewed mappings or an explicit user choice.

Common standard Opportunity fields include Id, Name, OwnerId, AccountId, Amount, IsClosed, IsWon, StageName, ForecastCategoryName and CloseDate. Their availability and picklist values still depend on the selected org. Do not assume stage, forecast, product, account-type or renewal values from another org.

## Account investigation

When the user asks to analyze project files and find a customer account:

1. Read the relevant files and state the account candidates and source evidence.
2. Query candidates in the selected org. Preserve ambiguous matches for review.
3. Once the account is verified, scope opportunities to its ID and state the recency filter.
4. Establish product relevance from confirmed private mappings or discovered schema plus explicit business confirmation. Opportunity-name text is supporting evidence.
5. Show stage, amount/currency, timing, owner and product evidence when returned. Preserve unresolved attribution, missing line items and incomplete pages.

An account investigation is account-scoped. Personal ownership/team membership does not silently narrow it.

Example after verifying the account and these fields:

```sql
SELECT Id, Name, Amount, StageName, CloseDate
FROM Opportunity
WHERE AccountId = '{verifiedAccountId}'
ORDER BY CloseDate DESC
LIMIT 20
```

## Personal coverage

Default "my pipeline" includes opportunities owned by the authenticated user or listing that user as an opportunity team member. Use `sf_pipeline_report` for this union. A person-profile Salesforce ID or partner ID is not proof of current org identity.

For a specialized personal query, verify the current user from the org's reported username. Query ownership and team membership separately, then deduplicate by Opportunity.Id. Salesforce restricts OR with semi-join subselects; do not combine an ownership condition and a team subselect with OR. Report the actual owner/team/overlap coverage and explicitly mark missing team access.

For explicit territory or product filters, confirm the field path and values and state how the filter changes coverage. Never infer primary territory ownership from observed records.

## Results and completeness

State the scope and date window. Keep currencies separate, including aggregate amounts whose currency basis is unknown. Null means not supplied; zero and false remain meaningful values. Failed queries, missing payloads and incomplete pages are not verified empty results. State returned coverage and preserve safe expanded query evidence.

Use fiscal periods from the selected organization for period reporting. Do not guess the fiscal start month. Use only returned or confirmed forecast categories and stage values. Keep summaries concise, with results and essential context; retain full safe evidence on expansion.
