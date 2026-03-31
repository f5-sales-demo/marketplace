---
name: transportation
description: >-
  Vehicle records, flight tracking, ship tracking, and transportation intelligence.
  Use when the user mentions: vehicle, flight tracking, ship tracking, license plate, VIN,
  maritime, aviation, ADS-B, vessel, aircraft, rail, satellite, package tracking.
user-invocable: false
---

# Transportation

Vehicle records, flight tracking, ship tracking, railway data,
satellite monitoring, and package tracking intelligence.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Vehicle registration
data access varies by jurisdiction.

## Tools Reference

Read `skills/transportation/references/tools.md` for the complete
list of 21 free tools in this category.

## Web Resources

| Resource | URL | Best For |
|----------|-----|----------|
| NHTSA Vehicle API | https://vpic.nhtsa.dot.gov/api/ | VIN decoding, vehicle specs (free API) |
| Flightradar24 | https://www.flightradar24.com/ | Real-time global flight tracking |
| ADS-B Exchange | https://www.adsbexchange.com/ | Unfiltered aircraft tracking (API) |
| Vessel Finder | https://www.vesselfinder.com/ | Global ship tracking (API) |
| Global Fishing Watch | https://globalfishingwatch.org | Fishing activity and IUU detection (API) |
| Carnet.ai | https://carnet.ai/ | AI vehicle identification from photos (API) |
| FindByPlate | https://findbyplate.com/ | US license plate lookup |
| autoDNA | https://www.autodna.com/ | VIN-based vehicle history |
| VinDecodr | https://vindecodr.com/ | Free VIN specification decode |
| OpenRailwayMap | https://www.openrailwaymap.org/ | Global railway infrastructure (API) |
| Deutsche Bahn Open Data | https://data.deutschebahn.com/opendata | German rail schedules/stations (API) |
| Ship AIS | https://shipais.uk/ | UK maritime AIS tracking |
| OpenSeaMap | https://www.openseamap.org | Nautical charts and port data |
| OpenAIP | https://www.openaip.net/ | Airspace and airfield data (API) |
| N2YO Satellite Tracker | https://www.n2yo.com/ | Satellite orbit tracking (API) |
| Track-Trace | https://www.track-trace.com/ | Multi-carrier package tracking |
| MyAccident | https://myaccident.org/ | US traffic accident records |

## Subcategories

- **Vehicle Records** -- VIN decoding, license plate lookup, accident history, vehicle ID from images
- **Flight Tracking** -- Real-time aircraft position, ADS-B, flight history, airport data
- **Ship / Maritime Tracking** -- AIS vessel tracking, port calls, fishing activity, nautical charts
- **License Plates / VIN** -- Plate-to-vehicle lookup, VIN specification decode, history reports
- **Aviation Reference** -- Airspace data, airfield metadata, aeronautical databases
- **Railway** -- Rail infrastructure mapping, schedules, station data
- **Satellite** -- Orbit tracking, pass predictions, space object monitoring
- **Logistics** -- Package tracking, supply chain movement verification

## Investigation Workflow

1. **Vehicle by VIN**: Decode via NHTSA API for make/model/year, then autoDNA for history
2. **Vehicle by plate**: Search FindByPlate (US) or AutoRef (EU) for vehicle identification
3. **Vehicle from image**: Submit photo to Carnet.ai for AI-based make/model identification
4. **Flight tracking**: Monitor aircraft on Flightradar24; use ADS-B Exchange for unfiltered data
5. **Aircraft history**: Query ADS-B Exchange API for historical track data and patterns
6. **Ship tracking**: Search Vessel Finder by name/IMO/MMSI for position and route history
7. **Fishing / IUU**: Use Global Fishing Watch for fishing activity patterns and transshipment
8. **Accident records**: Check MyAccident for US crash reports tied to location
9. **Cross-reference**: Pivot to `geolocation` for location context, `public-records` for registration

## curl / API Patterns

### NHTSA -- VIN Decode

```bash
curl -s "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/1HGCM82633A004352?format=json" \
  | jq '.Results[] | select(.Value != "" and .Value != null) | {Variable, Value}'
```

### NHTSA -- Decode VIN Batch

```bash
curl -s -X POST "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/" \
  -d "format=json&data=5UXWX7C5*BA,2011;1HGCM82633A004352" \
  | jq '.Results[] | {VIN, Make, Model, ModelYear}'
```

### ADS-B Exchange -- Aircraft by Hex Code

```bash
curl -s "https://adsbexchange.com/api/aircraft/v2/hex/A12345/" \
  -H "api-auth: $API_KEY" \
  | jq '.ac[] | {hex, flight, alt_baro, gs, lat, lon}'
```

### ADS-B Exchange -- Aircraft by Registration

```bash
curl -s "https://adsbexchange.com/api/aircraft/v2/registration/N12345/" \
  -H "api-auth: $API_KEY" \
  | jq '.ac[] | {reg, flight, alt_baro, lat, lon, t}'
```

### Vessel Finder -- Vessel Search

```bash
curl -s "https://api.vesselfinder.com/vessels?userkey=$API_KEY&imo=9321483" \
  | jq '.[] | {NAME, IMO, MMSI, DESTINATION, ETA, LAT, LON}'
```

### Global Fishing Watch -- Vessel Search

```bash
curl -s "https://gateway.api.globalfishingwatch.org/v3/vessels/search?query=vessel+name&limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.entries[] | {name: .registryInfo[0].shipname, flag: .registryInfo[0].flag, mmsi: .selfReportedInfo[0].ssvid}'
```

### Carnet.ai -- Vehicle Image Recognition

```bash
curl -s -X POST "https://carnet.ai/recognize-url" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/car.jpg"}' \
  | jq '.predictions[] | {make, model, generation, probability}'
```

### N2YO -- Satellite Position

```bash
curl -s "https://api.n2yo.com/rest/v1/satellite/positions/25544/41.702/-76.014/0/2/&apiKey=$API_KEY" \
  | jq '.positions[] | {satlatitude, satlongitude, sataltitude, timestamp}'
```

### OpenRailwayMap -- Query via Overpass API

```bash
curl -s "https://overpass-api.de/api/interpreter?data=[out:json];way[railway=rail](48.1,11.5,48.2,11.6);out;" \
  | jq '.elements[:5] | .[] | {id, tags}'
```

## Cross-Category Pivots

| When you find... | Pivot to | Why |
|------------------|----------|-----|
| Aircraft landing location | `geolocation` | Map coordinates, satellite imagery, proximity analysis |
| Vehicle owner name | `people-search` | Identity verification, address, social profiles |
| Vessel flag state | `public-records` | Maritime registry, port authority records |
| Company fleet vehicles | `business-records` | Corporate ownership, fleet registration |
| Suspicious vessel routes | `compliance-risk` | Sanctions screening for flagged ports/entities |

## OPSEC Notes

- NHTSA API is **free and anonymous** -- no registration, no rate limiting
- Flightradar24 web is passive; premium API tracks usage
- ADS-B Exchange API requires key registration; community feed is open
- Vessel Finder API requires paid key; web interface is free with limits
- Global Fishing Watch requires token registration (free for research)
- Carnet.ai processes images server-side -- do not submit sensitive photos
- FindByPlate is web-only; results vary by data freshness
- License plate lookups in EU may be subject to GDPR restrictions
- ADS-B data is broadcast publicly; monitoring it is legal in most jurisdictions

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Transportation tool search",
  prompt="Find OSINT tools for Transportation.\n
    Read skills/transportation/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Transportation investigation: [target]",
  prompt="Investigate using Transportation tools: [target]\n\n
    Primary: Read skills/transportation/references/tools.md\n
    Secondary: Read skills/geolocation/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with passive lookups (VIN decode, flight search) before deeper analysis."
)
```
