---
name: location
description: Investigates live public evidence for F5 Distributed Cloud Regional Edge locations. Use for an F5 metro, Regional Edge, site code, AS35280 facility, colocation, physical-address, or “where is this F5 edge?” question. Correlates current F5 Statuspage component names with current PeeringDB records and explicitly leaves exact building placement unresolved when evidence does not converge.
---

# F5 Regional Edge location investigation

Use `location` for one metro or site code. Use `edges` when the user asks for
the current discovered Regional Edge inventory or an optional component filter.

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
      Read `skill://cloudstatus:location/references/correlation-rules.md` and
      the network source ladder. Run the `location` or `edges` collector, then
      research only unresolved evidence.

      ## Edge Cases
      Multiple same-metro facilities remain competing candidates. IX presence
      never proves facility residence. Use only site codes visible in current
      F5 component names.

      ## Acceptance
      Return observed facts, labelled correlations, unresolved questions, and
      direct source links.
```

Pass the exact user query and selected operation to the task. Do not substitute a
stored address or a remembered facility list.
