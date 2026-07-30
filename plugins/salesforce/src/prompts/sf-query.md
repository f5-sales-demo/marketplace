Execute SOQL queries against Salesforce via sf CLI. Returns structured results as markdown tables.

<instruction>
Always provide a `description` parameter (2-4 words) summarizing the query's purpose — it appears in the output header. Examples: "forecast breakdown", "in-quarter pipeline", "closed-won deals", "open opportunities", "stalled deals", "renewal pipeline", "booked this quarter".

For structured pipeline reports, use **sf_pipeline_report** instead of sf_query. sf_pipeline_report runs multi-query orchestration (net new, booked, renewals, anomaly detection, close distribution) in one call.
Use sf_query for ad-hoc SOQL queries: specific account lookups, MEDDPICC data, case queries, or one-off investigations.

Use for ad-hoc data queries, account intelligence, and one-off investigations.

## Field discipline — never guess a field name

Salesforce orgs are heavily customized, and the templates below cannot know which fields yours has. Only a small standard core is safe to assume:

`Id`, `Name`, `Amount`, `StageName`, `CloseDate`, `ForecastCategoryName`, `Probability`, `Type`, `NextStep`, `Description`, `IsClosed`, `IsWon`, `CreatedDate`, `LastModifiedDate`, `LastActivityDate`, `OwnerId`, `AccountId`, and their `Account.`/`Owner.` relationships.

Everything else — every `__c` field, and several fields that merely look standard — must be confirmed with **sf_describe** before it appears in a query. A plausible spelling is not evidence: `CompetitorName`, `Competitor__c`, and `LeadSource` are all absent from orgs that hold that data under other names.

- Before using a field you have not already seen succeed in this org: `sf_describe {sobject: "Opportunity", match: "<concept>"}`.
- Match on the concept, not a guessed spelling — `match: "competitor"` finds every competitor field at once.
- When a query fails with `No such column`, call sf_describe and retry with the real name. Do not retry a guess.

**Picklist values are org-specific too.** Stage names, forecast categories, `Type` values, and territory values all vary. Take them from the session's Salesforce hint when present, or from sf_describe's picklist output — do not assume Salesforce's defaults.

Common query templates (substitute {userId} from user profile — read `xcsh://user` to get identifiers.salesforceId):

In-quarter pipeline (current fiscal quarter, team-scoped):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate, Owner.Name, LastActivityDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER AND ForecastCategoryName <> 'Omitted' ORDER BY Amount DESC NULLS LAST LIMIT 50

Forecast breakdown (current quarter):
  SELECT ForecastCategoryName, SUM(Amount) TotalAmount, COUNT(Id) TotalDeals FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER AND ForecastCategoryName <> 'Omitted' GROUP BY ForecastCategoryName ORDER BY SUM(Amount) DESC

Closing within 30 days:
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = NEXT_N_DAYS:30 ORDER BY CloseDate ASC LIMIT 20

Booked this quarter (closed-won):
  SELECT Account.Name, Name, Amount, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsWon = true AND CloseDate = THIS_FISCAL_QUARTER ORDER BY Amount DESC LIMIT 30

Slipped deals (close date in the past but recent — last 6 months):
  SELECT Account.Name, Name, Amount, StageName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate < TODAY AND CloseDate = LAST_N_DAYS:180 ORDER BY Amount DESC NULLS LAST LIMIT 20

Commit deals only ("what's my commit"):
  SELECT Account.Name, Name, Amount, StageName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER AND ForecastCategoryName = 'Commit' ORDER BY Amount DESC NULLS LAST LIMIT 20

Account pipeline ("show me [account]"):
  SELECT Name, Amount, StageName, ForecastCategoryName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND Account.Name LIKE '%{account}%' ORDER BY Amount DESC NULLS LAST LIMIT 20

Pipeline by account ("which accounts have the most pipeline"):
  SELECT Account.Name, COUNT(Id) DealCount, SUM(Amount) TotalAmount FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND ForecastCategoryName <> 'Omitted' GROUP BY Account.Name ORDER BY SUM(Amount) DESC NULLS LAST LIMIT 15

Recently changed in-quarter deals ("what changed this week"):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate, LastModifiedDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER AND LastModifiedDate = LAST_N_DAYS:7 ORDER BY LastModifiedDate DESC LIMIT 20

Lost/abandoned deals this year:
  SELECT Account.Name, Name, Amount, StageName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = true AND IsWon = false AND CloseDate = THIS_FISCAL_YEAR ORDER BY CloseDate DESC NULLS LAST LIMIT 20

Last quarter booked (closed-won):
  SELECT Account.Name, Name, Amount, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsWon = true AND CloseDate = LAST_FISCAL_QUARTER ORDER BY Amount DESC LIMIT 20

Pipeline generation this quarter ("what's my pipeline generation", "what deals were created this quarter"):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CreatedDate, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND CreatedDate = THIS_FISCAL_QUARTER ORDER BY Amount DESC NULLS LAST LIMIT 20

Win rate ("what's my win rate"):
  SELECT IsWon, COUNT(Id) DealCount, SUM(Amount) TotalAmount FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = true AND CloseDate = THIS_FISCAL_YEAR GROUP BY IsWon

Year-to-date bookings / top wins ("what are my top wins this year", "year-to-date bookings"):
  SELECT Account.Name, Name, Amount, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsWon = true AND CloseDate = THIS_FISCAL_YEAR ORDER BY Amount DESC LIMIT 20

Pipeline by territory ("break down pipeline by territory", "territory performance summary"):
  (substitute {territoryField} — resolve it first with sf_describe, see "Territory-based filtering" below)
  SELECT {territoryField}, COUNT(Id) DealCount, SUM(Amount) TotalAmount FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND ForecastCategoryName <> 'Omitted' GROUP BY {territoryField} ORDER BY SUM(Amount) DESC NULLS LAST

Next-quarter pipeline (forward-looking):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = NEXT_FISCAL_QUARTER AND ForecastCategoryName <> 'Omitted' ORDER BY Amount DESC NULLS LAST LIMIT 30

Stalled deals (no activity in 30+ days):
  SELECT Account.Name, Name, Amount, StageName, CloseDate, LastActivityDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER AND LastActivityDate < LAST_N_DAYS:30 ORDER BY Amount DESC NULLS LAST LIMIT 20

Large deals (top opportunities by amount):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate, Owner.Name FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND Amount > 100000 ORDER BY Amount DESC NULLS LAST LIMIT 15

Deals by product/use case (solution mapping):
  SELECT Account.Name, Name, Amount, StageName, CloseDate, Type FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_YEAR ORDER BY Account.Name, Amount DESC NULLS LAST LIMIT 30

Renewal pipeline (existing customer retention):
  ('Renewal' is the common Type value but is org-configurable — confirm with sf_describe {sobject: "Opportunity", match: "type"}, and check `match: "renewal"` for a dedicated renewal flag)
  SELECT Account.Name, Name, Amount, StageName, CloseDate, Type FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND Type = 'Renewal' ORDER BY CloseDate ASC LIMIT 20

Open cases:
  SELECT CaseNumber, Subject, Status, Priority, Account.Name, CreatedDate FROM Case WHERE IsClosed = false ORDER BY Priority, CreatedDate DESC LIMIT 50

Account overview:
  SELECT Name, Industry, AnnualRevenue, Type, Owner.Name FROM Account WHERE Type = 'Customer' ORDER BY AnnualRevenue DESC LIMIT 50

Pipeline report structure — when user asks for "pipeline report", "forecast", or "what's my pipeline":
Step 1: Run forecast breakdown query first to get the shape of the quarter.
Step 2: Executive summary — in-quarter total, Commit/Best Case/Pipeline split, booked-to-date.
Step 3: Top deals by account within each forecast category (Commit first, then Best Case).
Step 4: At-risk — slipped deals (CloseDate < TODAY) and early-stage deals closing soon.
Step 5: Booked this quarter — what has already closed.
Step 6: Recommended actions — for each risk, suggest a concrete next step (exec sponsor call, POC timeline, close plan review).

Focus on in-quarter pipeline. Do NOT include deals closing in future quarters unless user asks.
Flag deals with close dates in the past — these are slipped and need attention.
Keep to 5-7 key metrics. A pipeline report is for action, not data inventory.

Audience-aware formatting — adjust output based on who will read it:
**Self / AE partner:** Deal-level detail, close dates, stages, next technical actions.
**Manager ("report for my manager"):** Lead with commit total + deal-level evidence. Then risks: what slipped, what's stalled, mitigation plan. No technical detail — managers need forecast confidence, not architecture.
**Director/VP ("executive summary"):** Territory-level totals only. Commit/Best Case/Pipeline split. Coverage ratio if quota is known. One line per risk. No deal names unless asked.

Scoping: User may be an overlay SE. Use OpportunityTeamMember scoping (not OwnerId) as the primary filter.
AE-owned deals: SFDC does not allow OR with semi-join subselects. Run a SEPARATE query with OwnerId = '{aeId}' and merge results. Do not combine into one WHERE clause.

Stage-based filtering: Add WHERE StageName clauses to any template when the user asks about
deals needing technical engagement, demos, POCs, or specific stages.
`StageName` is standard, but its **values are configured per org** — take them from the session's
Salesforce hint, or from `sf_describe {sobject: "Opportunity", match: "stage"}`, which lists the
active picklist values. Never hardcode a stage name you have not seen in this org.
Order the discovered stages along the sales cycle and reason in terms of early / active / late:
deals in an early stage with close dates within 60 days are at-risk (insufficient time to progress).

Territory-based filtering: Add WHERE clauses on territory fields when the user asks about
specific territories, regions, or countries. Territory fields are **custom and org-specific** —
there is no standard one. Discover them with `sf_describe {sobject: "Opportunity", match: "territory"}`
(also try `match: "region"`, `match: "district"`, `match: "geo"`), which returns the field names
and, for picklists, their valid values.
Orgs typically expose more than one granularity — an exact territory, a category, and a broader
region — so pick the one matching what the user asked for.
Use LIKE '%keyword%' for partial matches on a text territory field.
Always combine territory filters with `ForecastCategoryName <> 'Omitted'`
or quarter scoping to avoid zombie pipeline noise.

Coverage ratio: When the user asks about pipeline coverage or "do I have enough pipeline", calculate coverage = in-quarter pipeline total / quarterly quota target. Healthy coverage is 3x-5x quota. Below 2x is a risk. Use the forecast breakdown (T2) total as the numerator. Quota is available from the user profile when set.

MEDDPICC deal qualification — when user asks to "qualify", "score", or assess deal health:
For each deal, assess these 8 MEDDPICC elements from available SFDC data:
**M** — Metrics: Is there a quantified business outcome? Check Opportunity.Description, close plan notes.
**E** — Economic Buyer: Is the EB identified? Check Contact roles with 'Economic Buyer' or 'Decision Maker'.
**D** — Decision Criteria: Are evaluation criteria documented? Check Opportunity.NextStep, Description.
**D** — Decision Process: Is the buying process mapped? Check stage progression timeline, paper process.
**P** — Paper Process: Are procurement steps known? Check Opportunity.Description for legal/procurement notes.
**I** — Identify Pain: Is the business pain articulated? Check Opportunity.Description, discovery notes.
**C** — Champion: Is there an internal advocate? Check Contact roles for 'Champion' or active engagement.
**C** — Competition: Are competitors identified? Competitor data has no standard home — run `sf_describe {sobject: "Opportunity", match: "competitor"}` to find this org's fields (they are often numbered, e.g. a primary plus alternates) and check the `OpportunityCompetitors` child relationship if it exists. Fall back to Opportunity.Description.
Score each element: Green (validated), Yellow (partially known), Red (unknown/missing).
Surface the gaps as action items, not just labels.

Results with relationship fields (e.g., Account.Name) are automatically flattened into dot-notation columns.
If the query returns more than 10,000 records, suggest using sf data export bulk instead.
Set use_tooling_api to true when querying metadata objects (ApexTrigger, ApexClass, CustomField).
Set all_rows to true to include deleted or archived records in results.
</instruction>
