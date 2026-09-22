---
name: location
description: The mandatory registry-only workflow for every F5 Distributed Cloud Regional Edge request. Use for maps, inventories, country, region, metro, site code, address, “show”, “where”, and “which Regional Edges” prompts. Collects current F5 Statuspage, PeeringDB AS35280, and Wikidata evidence without web search or remembered locations.
---

# F5 Regional Edge location investigation

Any prompt mentioning F5 Distributed Cloud Regional Edges must use this skill.
Do not route it to `cloudstatus:network-intelligence`, a general operator, web
search, OSINT geolocation, remembered information, source-code inspection, or
an ad hoc HTTP/Python command.

Run the collector directly in the parent session exactly once. Pass only the
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
Edges that are located in the United States” is an inventory/map request. “All
address locations” remains collector-only: use `locations --format map-v1` and
do not research individual addresses or facilities.

Bounded retries built into the collector are allowed. Do not run a second
collector command, follow up with general research, or inspect raw registry
responses. Keep missing or conflicting evidence visibly unresolved.

For inventory, map, show, where, country, or region intent, invoke `render_map`
exactly once in the parent session with this schema-valid placeholder:

```json
{"locations":[{"label":"Cloudstatus evidence hydration","longitude":0,"latitude":0}]}
```

The Cloudstatus guard replaces that sentinel at the tool boundary with the
collector's validated, coordinate-complete `map_locations` array, so never
copy, summarize, or alter those locations yourself. The renderer may fill its
optional location fields; the guard identifies the sentinel only by its single
entry, exact label, and zero coordinates, then discards the whole placeholder.
Report entries from
`unresolved_locations` as limitations; never assign them invented coordinates.
Do not call `display_media` afterward. Narrow factual requests remain text-first
unless the person explicitly asks for a visual.

The answer must include a short collection receipt: `Cloudstatus registry
collector`, its observation time, and the consulted F5 Statuspage, PeeringDB,
and Wikidata sources (including unavailable sources when applicable). Then
separate observed facts, facility correlations, inferences, and unresolved
limitations. A facility candidate never proves a Regional Edge building.
