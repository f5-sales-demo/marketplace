---
description: Browse the OSINT tool catalog by category
argument-hint: "[category]"
---

# /osint-catalog

Browse the OSINT Framework tool catalog.

## Without Arguments

Show the category index with tool counts:

Read `skills/osint-catalog/references/tree-index.md` and display
the full category table to the user.

## With Category Argument

Show tools for the specified category:

1. Match the argument to a skill directory name from the tree index
2. Read `skills/<matched-skill>/references/tools.md`
3. Display the tools to the user

### Category Names

Use these short names: `username`, `email`, `domain`, `cloud`, `ip`,
`images`, `social`, `messaging`, `people`, `phone`, `public-records`,
`compliance`, `business`, `transportation`, `geolocation`, `search`,
`communities`, `archives`, `translation`, `mobile`, `dark-web`,
`disinfo`, `blockchain`, `classifieds`, `encoding`, `tools`, `ai`,
`malware`, `exploits`, `threat-intel`, `opsec`, `documentation`, `training`
