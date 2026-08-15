# Network investigation playbook

## Deterministic collector

The standard-library collector emits JSON with `operation`, normalized `query`,
`observed_at`, `status`, `facts`, `inferences`, `sources`, and `errors`.

```text
network_lookup.py inspect <hostname|IP|prefix|ASN>
network_lookup.py route <IP|prefix|ASN>
network_lookup.py peering <ASN>
network_lookup.py location <metro|site-code>
network_lookup.py locations [query]
network_lookup.py path <hostname|IP>
```

Exit status `0` means complete or usable partial evidence, `2` means invalid
input, and `3` means every required source was unavailable.

HTTP calls use a 15-second timeout. Responses are memoized during the
invocation. HTTP 429 and server errors receive at most three attempts;
`Retry-After` is honored up to ten seconds. A failed source does not discard
usable results from another source.

## Investigation patterns

### Hostname or IP

1. Normalize the name or address.
2. Resolve current DNS answers for a hostname.
3. Obtain BGP prefix and origin observations for resulting addresses.
4. Select the responsible RDAP service from current IANA bootstrap data.
5. Check route visibility, looking-glass paths, and RPKI state.
6. Compare repeated address origins for anycast indicators, but do not call the
   architecture proven without corroborating operator evidence.

### Prefix or ASN

1. Separate registered holder, announced resource, and observed origin.
2. Record multi-origin results without assuming they are erroneous.
3. Inspect neighbours and collector paths as observed adjacency only.
4. Join direct facilities separately from IX participation and IX facilities.
5. For a potentially transit-free assessment, seek current relationship data
   and official policy. Return `indeterminate` without it.

### F5 location

1. Discover live Regional Edge groups and components from F5 Statuspage.
2. Extract only parenthesized site codes present in those names.
3. Resolve the current PeeringDB record for AS35280 by ASN.
4. Batch facility and exchange joins.
5. Apply the location correlation rules and leave ambiguous metros unresolved.
6. For a visual request, return normalized `MapLocationV1` records to the parent
   session for one `render_map` call. Keep unresolved entries in that array.

### Troubleshooting path

Run only for a target the user supplied or clearly implied:

- `ping`: four packets
- `tracepath`: at most 30 hops, with `traceroute` fallback
- `mtr`: report mode, five cycles
- Aggregate wall-clock limit: 45 seconds

Commands receive validated arguments as arrays. Missing programs, blocked ICMP,
insufficient privileges, and nonzero results are limitations, not permission to
scan ports or enumerate services.

## Fallback searches

When an API is unavailable or inconclusive, use increasingly specific official
queries:

- `<resource> site:stat.ripe.net`
- `AS<number> peering policy official`
- `AS<number> looking glass`
- `site:peeringdb.com AS<number> <metro>`
- `<operator> <facility-name> address official`
- `<IXP> participant AS<number> official`
- `<prefix> route views`

If two authoritative sources disagree, give both observations and timestamps.
Do not resolve the conflict by choosing the more convenient answer.
