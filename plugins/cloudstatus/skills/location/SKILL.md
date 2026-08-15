---
name: location
description: Investigates live public evidence for F5 Distributed Cloud Regional Edge locations. Use for an F5 metro, Regional Edge, site code, AS35280 facility, colocation, physical-address, or “where is this F5 edge?” question. Correlates current F5 Statuspage component names with current PeeringDB records and explicitly leaves exact building placement unresolved when evidence does not converge.
---

# F5 Regional Edge location investigation

Use `location` for a narrow factual investigation of one metro or site code.
Use `locations [query]` for current Regional Edge inventories and every visual
location request. An empty query discovers every currently published Regional
Edge component; a query matches the live country, region, metro, site code, or
component name.

Delegate with the xcsh `task` tool:

```yaml
agent: cloudstatus-network-operator
context: >-
  Goal: investigate F5 Regional Edge location evidence live. Distinguish
  direct AS facility presence from IX candidates, and do not claim exact
  service placement without converging evidence.
tasks:
  - id: InvestigateF5Location
    description: Correlate current F5 location evidence
    assignment: |-
      ## Target
      Investigate the exact metro, site code, address, or Regional Edge
      inventory requested by the user.

      ## Change
      Read `skill://cloudstatus:location/references/correlation-rules.md`,
      `skill://cloudstatus:location/references/source-hints.md`, and the network
      source ladder. Run `locations` for visual or inventory intent and
      `location` for narrow factual intent, then research only unresolved
      evidence from current official sources.

      ## Edge Cases
      Multiple same-metro facilities remain competing candidates. IX presence
      never proves facility residence. Use only site codes visible in current
      F5 component names.

      ## Acceptance
      Return observed facts, labelled correlations, unresolved questions,
      direct source links, and the collector's validated `map_locations` array.
```

Pass the exact user query and selected operation to the task. Do not substitute a
stored address or a remembered facility list.

For “show”, “where”, “map”, or country/region inventory intent, the parent xcsh
session must invoke `render_map` exactly once with the returned `MapLocationV1`
array. The delegated operator gathers evidence but does not display media.
Preserve unresolved entries in the tool input so the textual evidence remains
complete. Do not call `display_media` afterward.

Keep ordinary narrow factual requests text-first unless the human asks for a
visual. If `render_map` is unavailable, return the evidence list and state the
xcsh version requirement instead of inventing another display path.
