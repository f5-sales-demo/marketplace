---
name: location
description: The mandatory registry-only workflow for every F5 Distributed Cloud Regional Edge request. Use for maps, inventories, country, region, metro, site code, address, “show”, “where”, and “which Regional Edges” prompts. Collects current F5 Statuspage, PeeringDB AS35280, and Wikidata evidence without web search or remembered locations.
---

# F5 Regional Edge location investigation

Any prompt mentioning F5 Distributed Cloud Regional Edges must use this skill.
Do not route it to `cloudstatus:network-intelligence`, a general operator, web
search, OSINT geolocation, remembered information, source-code inspection, or
an ad hoc HTTP/Python command.

Run the collector directly in the parent session exactly once. Pass the exact
geographic filter through the Bash environment as `CLOUDSTATUS_QUERY`; do not
interpolate user text into the command.

For inventory, map, show, where, country, region, or “which Regional Edges”
intent, use the compact map contract:

```bash
python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"
```

For one narrow factual metro, site-code, or address investigation, use:

```bash
python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py location "$CLOUDSTATUS_QUERY"
```

Bounded retries built into the collector are allowed. Do not run a second
collector command, follow up with general research, or inspect raw registry
responses. Keep missing or conflicting evidence visibly unresolved.

For inventory, map, show, where, country, or region intent, invoke `render_map`
exactly once in the parent session with the returned `MapLocationV1` array.
Preserve unresolved entries in that input. Do not call `display_media` afterward.
Narrow factual requests remain text-first unless the person explicitly asks for
a visual.

The answer must include a short collection receipt: `Cloudstatus registry
collector`, its observation time, and the consulted F5 Statuspage, PeeringDB,
and Wikidata sources (including unavailable sources when applicable). Then
separate observed facts, facility correlations, inferences, and unresolved
limitations. A facility candidate never proves a Regional Edge building.
