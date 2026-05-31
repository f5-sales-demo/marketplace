Display safe metadata about a Salesforce org via sf CLI.

<instruction>
Returns only safe fields: username, orgId, instanceUrl, connectedStatus, alias.
NEVER return access tokens, client IDs, refresh tokens, or the raw sf org display JSON.
Use to verify org connectivity before running queries.
</instruction>
