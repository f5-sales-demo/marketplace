# Live network research source ladder

Move down this ladder only when higher-quality evidence does not answer the
question. Cite the record or page that directly supports each observed fact.

## 1. F5 sources

- F5 Distributed Cloud status API:
  `https://www.f5cloudstatus.com/api/v2/components.json`
- F5 product documentation, architecture material, service announcements, and
  official support articles

Status components establish current published service naming and health. They
do not expose a private service-placement database.

## 2. PeeringDB

API base: `https://www.peeringdb.com/api`

| Record | Use |
| --- | --- |
| `net?asn=<ASN>` | Resolve the current network record from the ASN |
| `netfac?net_id=<ID>` | Direct network-to-facility presence |
| `netixlan?net_id=<ID>` | Exchange LAN participation and public addresses |
| `fac?id__in=<IDs>` | Current facility operator, address, counts, and freshness |
| `ix?id__in=<IDs>` | Current exchange names and metadata |
| `ixfac?ix_id__in=<IDs>` | Facilities where an exchange is present; not direct network presence |

PeeringDB is participant-maintained interconnection data. Record absence is not
proof of physical absence, and an IXP-to-facility join is only a candidate.

## 3. RIPEstat

API base: `https://stat.ripe.net/data`

- `network-info/data.json?resource=<IP-or-prefix>` for observed origins
- `announced-prefixes/data.json?resource=<ASN>` for prefixes observed during the
  response's stated query window
- `asn-neighbours/data.json?resource=<ASN>` for observed BGP adjacency
- `looking-glass/data.json?resource=<resource>` for collector paths
- `routing-status/data.json?resource=<resource>` for visibility and history
- `rpki-validation/data.json?resource=<ASN>&prefix=<prefix>` for validation

RIPEstat observations distinguish route origin and adjacency from registration
and commercial relationship. Treat announcement and neighbour records as
windowed observations, not an instantaneous routing-table snapshot. The bundled
collector returns aggregate neighbour counts with at most 200 ranked details
and validates at most 25 prefixes per invocation; it reports both bounds in its
JSON rather than silently implying exhaustive evidence.

## 4. RDAP registration

Start with IANA bootstrap data at `https://data.iana.org/rdap/` and query the
responsible RIR or registry service. Use IP RDAP for address resources, autnum
RDAP for ASNs, and domain RDAP for registered names. Keep registration holder
and BGP route origin in separate fields.

## 5. Official operator and IXP material

Search official network policy pages, colocation-operator pages, carrier maps,
IXP participant directories, and operator looking glasses. Useful searches:

- `site:<official-domain> <ASN> peering policy`
- `site:<official-domain> <metro> facility address`
- `site:<ixp-domain> <ASN> participant`
- `<ASN> looking glass official`

Prefer a record page over a search snippet.

For a representative metro point only, query current Wikidata entity data and
cite the selected entity. Require a unique label/country match, mark the point
`metro/approximate`, and leave ambiguous matches unresolved. Public Nominatim
is excluded from the v1 location workflow.

## 6. Measurements and research

- RIPE RIS and Route Views for independent route observations
- Packet Clearing House for IXP and routing research
- CAIDA AS Relationships for inferred provider, customer, and peer relations

CAIDA relationships are research inferences, not commercial contracts. State
the dataset vintage and inference method when they affect an assessment.

## 7. Secondary evidence

Use reputable industry databases and reporting only as labelled secondary
evidence. Never use an aggregator or search-result snippet as the sole basis for
an exact facility claim.

When evidence does not converge, report the competing candidates, why each
remains plausible, and the unresolved question.
