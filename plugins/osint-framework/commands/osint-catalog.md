---
description: Browse the shipped OSINT tool catalog by category
argument-hint: "[category]"
---

# /osint-catalog

Browse only the installed OSINT Framework reference catalog. This command is catalog-only:
it does not investigate targets, open URLs, install tools or check external service availability.

## Without arguments

Read `skills/osint-catalog/references/tree-index.md`. Derive category and tool counts from
that installed index instead of repeating hardcoded totals. State installed plugin identity,
source, scope and completion. Show the first twelve rows with total and shown counts using
Category, Skill and Tools columns. Offer the next page and the complete safe category table
once on request.

## With a category argument

Match the argument to the exact skill directory in the index. Do not construct a path from
an unmatched argument. Read `skills/<matched-skill>/references/tools.md`, then show the first
twelve tools with Tool, Type, Pricing, OPSEC and Description columns. Include total and shown
counts, the selected category and the reference path. Keep URLs and complete safe details in
one expanded evidence section or continuation.

Use existing short aliases where unambiguous: `username`, `email`, `domain`, `cloud`, `ip`,
`images`, `social`, `messaging`, `people`, `phone`, `public-records`, `compliance`, `business`,
`transportation`, `geolocation`, `search`, `communities`, `archives`, `translation`, `mobile`,
`dark-web`, `disinfo`, `blockchain`, `classifieds`, `encoding`, `tools`, `ai`, `malware`,
`exploits`, `threat-intel`, `opsec`, `documentation`, `training`.

## Outcomes and evidence

Distinguish an unknown category, no matching tools, an unavailable reference and a partial read.
Report the literal corrective action: choose a category from the index, or restore the missing
installed reference. A truncated read is partial; read its remaining bounded line windows before
claiming complete coverage. Preserve zero counts, false flags, empty descriptions and unknown
values. A catalog entry is a recommendation, not an executed result or proof of service health.
