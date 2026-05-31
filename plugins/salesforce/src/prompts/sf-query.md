Execute SOQL queries against Salesforce via sf CLI. Returns structured results as markdown tables.

<instruction>
Always provide a `description` parameter (2-4 words) summarizing the query's purpose — it appears in the output header. Examples: "forecast breakdown", "in-quarter pipeline", "closed-won deals", "open opportunities", "stalled deals", "renewal pipeline", "booked this quarter".

For structured pipeline reports, use **sf_pipeline_report** instead of sf_query. sf_pipeline_report runs multi-query orchestration (net new, booked, renewals, anomaly detection, close distribution) in one call.
Use sf_query for ad-hoc SOQL queries: specific account lookups, MEDDPICC data, case queries, or one-off investigations.

Use for ad-hoc data queries, account intelligence, and one-off investigations.

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
  SELECT ETM_Core_Territory__c, COUNT(Id) DealCount, SUM(Amount) TotalAmount FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND ForecastCategoryName <> 'Omitted' GROUP BY ETM_Core_Territory__c ORDER BY SUM(Amount) DESC NULLS LAST

Next-quarter pipeline (forward-looking):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = NEXT_FISCAL_QUARTER AND ForecastCategoryName <> 'Omitted' ORDER BY Amount DESC NULLS LAST LIMIT 30

Stalled deals (no activity in 30+ days):
  SELECT Account.Name, Name, Amount, StageName, CloseDate, LastActivityDate FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER AND LastActivityDate < LAST_N_DAYS:30 ORDER BY Amount DESC NULLS LAST LIMIT 20

Large deals (top opportunities by amount):
  SELECT Account.Name, Name, Amount, StageName, ForecastCategoryName, CloseDate, Owner.Name FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND Amount > 100000 ORDER BY Amount DESC NULLS LAST LIMIT 15

Deals by product/use case (solution mapping):
  SELECT Account.Name, Name, Amount, StageName, CloseDate, Type FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '{userId}') AND IsClosed = false AND CloseDate = THIS_FISCAL_YEAR ORDER BY Account.Name, Amount DESC NULLS LAST LIMIT 30

Renewal pipeline (existing customer retention):
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

Stage-based filtering: Add WHERE StageName clauses to any template when the user asks about deals needing technical engagement, demos, POCs, or specific stages. Early stages: 'Awareness', 'Research and Internal Education', 'Pending Initial Meeting'. Active stages: 'Budget and Timing Determination', 'Solution - Front Runner'. Late stages: 'Negotiation', 'Close - Booked'. Deals in early stages with close dates within 60 days are at-risk (insufficient time to progress).

Territory-based filtering: Add WHERE clauses on territory fields when the user asks about specific territories, regions, or countries. Available fields: `ETM_Core_Territory__c` (exact territory, e.g. 'AMER: Major Accounts FinSvcs Red 9'), `Territory_Credited_Category__c` (category, e.g. 'Financial', 'OEM'), `Territory_Grouping__c` (region, e.g. 'USA', 'Canada'). Use LIKE '%keyword%' for partial matches (e.g. `ETM_Core_Territory__c LIKE '%Canada%'`). Always combine territory filters with `ForecastCategoryName <> 'Omitted'` or quarter scoping to avoid zombie pipeline noise.

Coverage ratio: When the user asks about pipeline coverage or "do I have enough pipeline", calculate coverage = in-quarter pipeline total / quarterly quota target. Healthy coverage is 3x-5x quota. Below 2x is a risk. Use the forecast breakdown (T2) total as the numerator. Quota is available from the user profile when set.

MEDDPICC deal qualification — when user asks to "qualify", "score", or assess deal health:
For each deal, assess these 8 MEDDPICC elements from available SFDC data:
**M**etrics: Is there a quantified business outcome? Check Opportunity.Description, close plan notes.
**E**conomic Buyer: Is the EB identified? Check Contact roles with 'Economic Buyer' or 'Decision Maker'.
**D**ecision Criteria: Are evaluation criteria documented? Check Opportunity.NextStep, Description.
**D**ecision Process: Is the buying process mapped? Check stage progression timeline, paper process.
**P**aper Process: Are procurement steps known? Check Opportunity.Description for legal/procurement notes.
**I**dentify Pain: Is the business pain articulated? Check Opportunity.Description, discovery notes.
**C**hampion: Is there an internal advocate? Check Contact roles for 'Champion' or active engagement.
**C**ompetition: Are competitors identified? Check Opportunity.CompetitorName or description.
Score each element: Green (validated), Yellow (partially known), Red (unknown/missing).
Surface the gaps as action items, not just labels.

Results with relationship fields (e.g., Account.Name) are automatically flattened into dot-notation columns.
If the query returns more than 10,000 records, suggest using sf data export bulk instead.
Set use_tooling_api to true when querying metadata objects (ApexTrigger, ApexClass, CustomField).
Set all_rows to true to include deleted or archived records in results.
</instruction>
