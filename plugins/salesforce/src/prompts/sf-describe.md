Look up the real field and relationship names on a Salesforce object. Use this **before** writing SOQL that touches any field you have not already seen in this org.

<instruction>
Salesforce orgs are heavily customized. Beyond a small standard core, field names are org-specific and unguessable — a typical Opportunity carries several hundred custom fields, and two orgs rarely share them.

A plausible-looking name is not evidence the field exists: `Competitor__c`, `CompetitorName`, and `LeadSource` are all absent from orgs where competitor and lead-source data is very much present under other names.

**Never guess a field name. Look it up here first.** A guessed field costs a failed query and a round trip; a lookup costs one call.

## Parameters

- `sobject` (required) — API name of the object, e.g. `Opportunity`, `Account`, `OpportunityLineItem`, `My_Object__c`.
- `match` (optional) — case-insensitive substring matched against both the API name and the human label. Also matches child relationships.
- `target_org` (optional) — org alias or username; defaults to the default org.

## Use `match`

Objects are far too large to return whole, so an unfiltered call returns only the standard fields plus a count of the custom ones. Pass `match` to reach the custom fields:

- Competitor data: `{sobject: "Opportunity", match: "competitor"}`
- Territory or region fields: `{sobject: "Opportunity", match: "territory"}`
- Renewal or subscription fields: `{sobject: "Opportunity", match: "renewal"}`
- Anything with "ACV" in the name or label: `{sobject: "Opportunity", match: "acv"}`

Match on the concept, not on a guessed spelling. `match: "competitor"` finds `Competitor_1__c`, `Other_Competitor__c`, and `LID__MainCompetitors__c` at once; `match: "Competitor__c"` finds nothing.

## What comes back

A table of `Field | Label | Type | Notes`. Notes carry the active picklist values, the target of a reference field, and a `not filterable` marker for fields that cannot appear in a `WHERE` clause.

**Picklist values are authoritative** — take stage names, forecast categories, and type values from here rather than assuming the Salesforce defaults. Stage names in particular are configured per org.

Matching child relationships are listed separately with the relationship name to use in a SOQL subquery. Competitors, for instance, often live on the child `OpportunityCompetitor` object rather than a field on Opportunity:

```
SELECT Name, (SELECT CompetitorName FROM OpportunityCompetitors) FROM Opportunity
```

## After a failed query

When `sf_query` reports `No such column` or `sObject type ... is not supported`, call this tool with a `match` on the concept you were after, then re-run the query with the real name. Do not retry a guess, and do not shell out to `sf sobject describe` — this tool is that call, with the output filtered down to what fits.
</instruction>
