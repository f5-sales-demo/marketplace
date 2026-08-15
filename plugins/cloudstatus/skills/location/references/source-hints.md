# Request-scoped Regional Edge source hints

These hints are starting points, not a location database. Consult sources during
the current request and retain the observation time, URL, source name, and the
claim that supports every coordinate.

## Stable starting points

| Source | Request template | Expected current fields |
| --- | --- | --- |
| F5 Statuspage | `https://www.f5cloudstatus.com/api/v2/components.json` | component/group IDs, names, status, update time, and any source-published location fields |
| PeeringDB network | `https://www.peeringdb.com/api/net?asn=35280` | current network ID and identity |
| Direct facilities | `https://www.peeringdb.com/api/netfac?net_id=<current-id>` | network-to-facility relationships |
| Exchange LANs | `https://www.peeringdb.com/api/netixlan?net_id=<current-id>` | exchange participation; never facility residence by itself |
| Facility records | `https://www.peeringdb.com/api/fac?id__in=<current-ids>` | operator, metro, address fields, coordinates when published, site URL, and update time |
| Exchange records | `https://www.peeringdb.com/api/ix?id__in=<current-ids>` and `ixfac?ix_id__in=<current-ids>` | exchange identity and limited facility candidates |
| Wikidata Query Service | `https://query.wikidata.org/sparql?query=<encoded-query>&format=json` | current entity IDs, English labels, country labels, and P625 coordinates |

Open current official operator or facility pages after the deterministic
collector when a facility candidate matters. Prefer a page URL returned in the
current facility record. Do not manufacture an operator URL from memory.

## Evidence ranking

1. A coordinate or address directly published in the current F5 component
   record is direct evidence for that record.
2. A live F5 site code correlated with direct AS35280 facility presence is a
   facility candidate. Even a sole candidate is `inferred/candidate`, never
   exact service placement.
3. Direct AS35280 metro presence establishes only network presence in a metro.
4. An exchange-to-facility relationship is a research lead, not AS or service
   residence.
5. A current Wikidata P625 coordinate may represent a named metro. Mark it
   `metro/approximate`, cite the entity, and state that it is not a facility.
6. When candidates conflict or no trustworthy coordinate is available, return
   `ambiguous` or `unresolved` and omit coordinates.

Never use model memory as evidence. Public Nominatim is excluded from this
workflow. Do not infer coordinates from postal text or similar-looking site
codes.

## Rate and cache discipline

- Run only after a human request; there is no scheduled discovery.
- Fetch the Statuspage inventory and AS35280 joins once per collector
  invocation.
- Batch PeeringDB IDs and exact Wikidata metro labels; do not crawl records or
  prefetch adjacent entities.
- Honor HTTP 429 and `Retry-After`, keep retries bounded, and preserve partial
  evidence when a source is unavailable.
- Memoization is invocation-scoped. Do not write location responses, topology,
  facility mappings, or coordinates to a runtime cache.

## Generic normalization examples

A fictional component `Fixtureville (fv1), Exampleland` with one current
Wikidata entity may be normalized to a representative metro point with
`precision: metro`, `resolution: approximate`, and a claim that the coordinate
represents the metro only. If two current direct facilities remain possible,
use `resolution: ambiguous`. If the live sources supply no trustworthy point,
return an unresolved `MapLocationV1` entry without longitude or latitude.
