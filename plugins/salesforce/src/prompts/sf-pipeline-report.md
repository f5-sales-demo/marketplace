Generate a comprehensive F5 Distributed Cloud pipeline report for the current fiscal quarter.

<instruction>
Use this tool when the user asks for a "pipeline report", "forecast", "what's my pipeline", "how's the quarter", "show my deals", or any request for a structured view of the sales pipeline. It runs all the necessary queries automatically.

Do NOT use sf_query for pipeline reports — sf_pipeline_report handles the multi-query orchestration (net new, booked, renewals, anomaly detection, close distribution) in a single call.

Use sf_query for ad-hoc, one-off lookups: specific account checks, MEDDPICC qualification, case queries, or any query outside the pipeline reporting context.

Parameters:
**target_org**: optional — only needed when the default org is not the correct Salesforce instance.

What the report includes:
Booked (closed-won) this quarter by account, broken out by Platform (Distributed Cloud) and Point (Shape + DI).
Open net-new pipeline, grouped by territory and account, with forecast category (Commit / Best Case / Pipeline).
Open renewal pipeline (True ACV / Upsell ACV).
Forecast summary: Commit + Best Case + Pipeline totals for quota-eligible products.
Top deals by amount with owner, stage, close date, and next steps.
Close-date distribution: pipeline bucketed by month.
FY-to-date booked total vs quota (when quota is set in user profile).
Data quality anomalies: slipped close dates, stalled deals (no activity >30 days), missing territories, urgent renewals closing within 30 days, unclassified SKUs.
Recent pipeline changes (last 7 days) from OpportunityFieldHistory.

After the tool returns, present the report as-is. Do not re-query Salesforce to fill in gaps — the report already contains all available data. If the report shows zero pipeline, mention that the user may need to read `xcsh://salesforce?refresh=true` to refresh their team membership context.
</instruction>
