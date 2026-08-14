# cloudstatus

`cloudstatus` gives xcsh live cloud-status and Internet network-investigation
workflows. It teaches xcsh how to gather current registration, routing,
interconnection, facility, DNS, and operational evidence instead of shipping a
precomputed topology database.

The default status and location target is F5 Distributed Cloud. The general
network workflow accepts arbitrary hostnames, IP addresses, prefixes, and ASNs.

## What xcsh can investigate

| Skill | Use it for |
| --- | --- |
| `cloudstatus:monitor` | Service health, incidents, maintenance, components, and status briefings |
| `cloudstatus:location` | F5 Regional Edge metros, site codes, AS35280 presence, and facility candidates |
| `cloudstatus:network-intelligence` | DNS, RDAP, BGP origins, RPKI, routes, neighbours, facilities, IXPs, peering, and bounded path diagnostics |

The plugin installs two task agents. The status operator has only `read` and
`bash`; the network operator adds `web_search` for the documented fallback
research ladder.

## Ask in natural language

Examples:

```text
What is the current F5 Distributed Cloud status?
Investigate example.net: registration, DNS answers, route origins, and RPKI.
Which prefixes does AS35280 currently announce, and which neighbours are observed?
Show the direct facilities and IX participation for AS64496.
Where is the Frankfurt F5 Regional Edge? Separate facts from facility candidates.
Is this network potentially transit-free? Tell me when the evidence is indeterminate.
Troubleshoot the path to 192.0.2.25 with bounded diagnostics.
```

The existing slash command remains status-only:

```text
/cloud-status
/cloud-status status
/cloud-status incidents
/cloud-status maintenance
/cloud-status briefing
/cloud-status search dns
/cloud-status components
```

Location and general Internet questions route through skills from ordinary
language; version 1.4.0 adds no new slash command.

## Investigation model

The deterministic Python collector starts with the smallest relevant live
query and emits a consistent evidence envelope:

```json
{
  "operation": "route",
  "query": "203.0.113.0/24",
  "observed_at": "<UTC timestamp>",
  "status": "complete",
  "facts": {},
  "inferences": [],
  "sources": [],
  "errors": []
}
```

It uses these source classes in order:

1. F5 Statuspage and official F5 material
2. PeeringDB network, facility, exchange, and exchange-facility records
3. RIPEstat routing, neighbour, looking-glass, and RPKI observations
4. Current IANA RDAP bootstrap data and the responsible registry
5. Official network, colocation-operator, carrier, and IXP pages
6. RIPE RIS, Route Views, Packet Clearing House, and CAIDA research data
7. Reputable secondary databases and reporting, clearly labelled

API throttling and source outages are expected operating conditions. HTTP calls
have bounded timeouts and retries, duplicate requests are memoized within one
invocation, and usable partial evidence is retained.

## Evidence boundaries

Reports keep four categories distinct:

- Observed facts from a named current source or diagnostic
- Correlations created by joining current records
- Professional inference with its basis and limitations
- Unresolved questions and competing candidates

In particular, the workflow does not treat ASN registration as BGP origin,
observed adjacency as a commercial relationship, IXP participation as private
interconnection, facility presence as service placement, or an anycast
indicator as proof of deployment architecture.

Facilities are described by measurable attributes such as direct ASN presence,
network and IXP counts, operator, current source-supplied address, and record
freshness. “Tier-1” is a network claim, not a facility property. A network is
reported as potentially transit-free only when relationship evidence supports
that assessment; otherwise the result is `indeterminate`.

For F5 location questions, a live site-code match plus direct AS35280 facility
presence is the strongest public correlation. It still does not prove that a
particular F5 service instance occupies the building. Metro-only or IXP-only
evidence remains explicitly unresolved.

## Bounded active diagnostics

Clear troubleshooting intent automatically selects the path workflow for the
user-supplied or clearly implied target:

- Four ping packets
- A trace limited to 30 hops, using `tracepath` with `traceroute` fallback
- `mtr` report mode with five cycles
- A 45-second aggregate diagnostic limit

The workflow does not scan ports, enumerate services, or choose unrelated
targets. Missing programs, blocked ICMP, insufficient privilege, and nonzero
probe results are reported as limitations.

## Status configuration

Set `STATUSPAGE_URL` to use the monitor skill with another Statuspage-backed
service:

```bash
export STATUSPAGE_URL=https://status.example.net
```

F5 location investigation always uses current F5 Statuspage and AS35280 source
records. There is no topology-matrix or address override.

## Runtime requirements

- xcsh with plugin skill, task-agent, `skill://`, Bash, and web-search support
- Python 3 standard library for network collection
- `curl` and `jq` for status reports
- Network access to the selected live sources
- Optional `ping`, `tracepath` or `traceroute`, and `mtr` for path diagnostics

No API key is required for the default public endpoints, but each provider may
throttle, change, or temporarily refuse anonymous requests.

## Development verification

From the plugin directory:

```bash
bash scripts/tests/run-tests.sh
```

The hermetic tests use synthetic fixtures. Live UAT is a separate, repeatable
check because production topology must not be cached into the plugin.
