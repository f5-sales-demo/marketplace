---
name: network-intelligence
description: Investigates arbitrary Internet hostnames, IP addresses, prefixes, ASNs, routes, BGP origins and neighbours, peers, IXPs, facilities, registration, RPKI state, DNS, and network paths from live sources. Use for topology, routing, PeeringDB, RDAP, RIPEstat, transit-free or Tier-1 network assessment, anycast questions, and troubleshooting that benefits from bounded ping, tracepath or traceroute, and mtr evidence. Separates observed facts, correlations, inference, and unknowable details.
---

# Live Internet network intelligence

Choose the narrowest deterministic operation:

| Question | Operation |
| --- | --- |
| General hostname, IP, prefix, or ASN investigation | `inspect` |
| Origin, announcement, neighbour, looking-glass, or RPKI question | `route` |
| ASN facilities, exchanges, interconnection, or transit-free assessment | `peering` |
| F5 Regional Edge metro or site-code question | `location` |
| Current F5 Regional Edge components | `edges` |
| Clear reachability, latency, hop, or path troubleshooting intent | `path` |

Run `path` automatically for clear troubleshooting or path-analysis intent when
the user supplied or clearly implied the target. It runs only bounded ping,
trace, and mtr diagnostics. Do not diagnose an unrelated target.

Delegate with the xcsh `task` tool:

```yaml
agent: cloudstatus-network-operator
context: >-
  Goal: answer the network question from current evidence. Run the
  deterministic collector first, follow the source ladder only when needed,
  distinguish facts from inference, and keep diagnostics on the user target.
tasks:
  - id: InvestigateNetwork
    description: Collect and interpret live network evidence
    assignment: |-
      ## Target
      Investigate the exact hostname, IP, prefix, ASN, route, peer, IXP,
      facility, or path in the user request.

      ## Change
      Read `skill://cloudstatus:network-intelligence/references/source-ladder.md`
      and
      `skill://cloudstatus:network-intelligence/references/query-playbook.md`.
      Run the selected collector and continue through official research when
      evidence is partial.

      ## Edge Cases
      Keep registration separate from route origin, adjacency separate from
      commercial relationship, and IX participation separate from facility
      presence. Report competing candidates and indeterminate relationships.

      ## Acceptance
      Return observed facts, correlations, professional inference, unresolved
      questions, limitations, and direct source links.
```

Pass the exact query, operation, user intent, and relevant filters. Preserve
partial evidence and explicitly state what public evidence cannot establish.
