Full-text search across GitLab issue titles, descriptions, labels, and comments via glab CLI.

<instruction>
Use for "find issues about Tempus", "search for login timeout bugs", "bugs mentioning Safari".
Three-tier search: REST API (fast, titles+descriptions), GraphQL (includes comments), client-side dedup.
Supports state filtering and label filtering alongside text search.
</instruction>
