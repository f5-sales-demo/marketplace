---
name: location
description: Investigate current F5 Distributed Cloud Regional Edge locations using registry evidence. Use for requested maps, inventories, and factual location claims. Independent research, source inspection, and follow-ups remain available.
---

# F5 Regional Edge location investigation

Use this workflow for authoritative Regional Edge location claims. Inspect
source and perform authorized independent research directly when requested,
including mixed requests and follow-ups. Label supplemental evidence and
inferences separately from registry observations.

Run the collector directly and reuse valid evidence for the same query. Pass only the
normalized geographic filter through the Bash environment as
`CLOUDSTATUS_QUERY` (for example, `United States`, not the full user request);
do not interpolate user text into the command. Multiple current region names
may be passed together when the request is a union, such as
`Americas Europe Asia`; the collector resolves them only against live group
names.

For inventory, map, show, where, country, region, or “which Regional Edges”
intent, use the compact map contract:

```bash
python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"
```

For one narrow factual metro, site-code, or address investigation, use:

```bash
python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py location "$CLOUDSTATUS_QUERY"
```

For example, “show me a map of all the address locations of the F5 Regional
Edges that are located in the United States” is an inventory/map request. Use `locations --format map-v1` for the inventory. Supplemental facility
research is permitted; facility candidates do not establish an Edge building.

Bounded retries and refreshed collections for a changed query or failed
collection are allowed. Keep missing or conflicting evidence visibly unresolved.

For inventory, map, show, where, country, or region intent, invoke `render_map`
directly for the validated collection. Pass the collector's validated,
coordinate-complete `map_locations` array unchanged as `locations`; never
summarize, alter, or reconstruct those entries. The renderer may fill its
optional location fields. Report entries from `unresolved_locations` as
limitations; never assign them invented coordinates. Do not call
`display_media` afterward. Narrow factual requests remain text-first unless the
person explicitly asks for a visual.

The answer must include a short collection receipt: `Cloudstatus registry
collector`, its observation time, and the consulted F5 Statuspage, PeeringDB,
and Wikidata sources (including unavailable sources when applicable). Then
separate observed facts, facility correlations, inferences, and unresolved
limitations. A facility candidate never proves a Regional Edge building.
