---
name: geolocation
description: >-
  Location intelligence — geolocation, satellite imagery, mapping, and geographic analysis.
  Use when the user mentions: geolocation, map, satellite, location, coordinates, geographic, street view.
user-invocable: false
---

# Geolocation & Maps

Location intelligence — geolocation, satellite imagery, mapping, and geographic analysis.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/geolocation/references/tools.md` for the complete
list of 47 free tools in this category.

## Key CLI Tools

| Tool | Install | Usage |
|------|---------|-------|
| Hyperlapse | `git clone https://github.com/TeehanLax/Hyperlapse.js && npm install` | Embed as JS library for Street View hyperlapse animations |

### All Install Methods — Hyperlapse

| Method | Command |
|--------|---------|
| git clone | `git clone https://github.com/TeehanLax/Hyperlapse.js` |
| npm | `npm install` (after clone, for dependencies) |
| pip | N/A |
| go | N/A |
| apt | N/A |
| docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

## Subcategories

- **Geolocation Tools** — AI-assisted image geolocation, shadow analysis, star-field solving (GeoSpy, SunCalc, Astrometry)
- **Satellite Imagery** — Historical and multispectral satellite datasets, change detection (EarthExplorer, LandsatLook, Corona, Flash Earth, SkyFi, Wayback Imagery)
- **IP Geolocation** — Cell tower triangulation, Wi-Fi/Bluetooth beacon positioning (OpenCelliD, beaconDB)
- **Wi-Fi & Mobile Coverage** — Carrier signal mapping, antenna lookup (OpenSignal, AntennaSearch)
- **Coordinates** — Coordinate conversion, batch geocoding/reverse geocoding, MGRS (GPSVisualizer, Batch Geocoding, MGRS converter)
- **Maps** — General mapping, street-level imagery, regional platforms (Google Maps, Bing Maps, OpenStreetMap, Yandex Maps, Baidu Maps, Naver, HERE Maps, Overpass Turbo)
- **Street-Level Imagery** — Virtual walkthroughs, crowdsourced street photos (Instant Google Street View, Google Maps Streetview Player, KartaView, Hivemapper)
- **Specialized Maps** — Rail, infrastructure, trails, conflict tracking (OpenRailwayMap, OpenInfrastructureMap, LiveUaMap, Beholder)
- **Map Reporting** — Annotated maps, event geolocation (ScribbleMaps, Google Earth Overlays, Dual Maps)

## Investigation Workflow

1. **Image analysis**: If working from a photo, use GeoSpy for AI-assisted location hypothesis, then SunCalc for shadow/time validation
2. **Coordinate extraction**: Extract EXIF GPS data from images; convert formats with GPSVisualizer or MGRS converter
3. **Map correlation**: Cross-reference location on Google Maps, Bing Maps, and OpenStreetMap for POI context
4. **Street-level verification**: Use Instant Google Street View or KartaView for ground-truth visual confirmation
5. **Satellite review**: Check EarthExplorer or Wayback Imagery for historical satellite views and change detection
6. **Regional platforms**: For Russia/CIS use Yandex Maps; for China use Baidu Maps; for Korea use Naver
7. **Infrastructure context**: Overlay OpenRailwayMap, OpenInfrastructureMap for nearby infrastructure
8. **Cell/Wi-Fi triangulation**: Use OpenCelliD or beaconDB if cell tower or Wi-Fi data is available
9. **Temporal analysis**: Use SunCalc for shadow-based time estimation; check Google Maps Update Alerts for imagery freshness

## Cross-Category Pivots

- **images-videos** — Extract EXIF metadata and visual clues from images before geolocation; pivot to images-videos for reverse image search and metadata analysis
- **ip-address-recon** — IP geolocation results feed into broader IP investigation; pivot to ip-address-recon for ASN, hosting, and network context
- **transportation** — Geolocation near transport infrastructure; pivot to transportation for flight, vessel, and vehicle tracking

## OPSEC Notes

- All 47 tools in this category are marked **Passive** — they query public map data without alerting targets
- **GeoSpy** requires **registration** — your uploads and queries are logged by the provider
- Several satellite data portals (EarthExplorer, Corona, Historic Aerials, SkyFi) require **registration** for downloads
- Google Maps API calls with personal API keys can be traced back to your account
- Use OpenStreetMap and Overpass Turbo for vendor-independent, no-login geospatial queries
- When investigating sensitive locations, avoid logged-in map sessions that tie queries to your identity
- Street View imagery requests may be rate-limited and logged by Google

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Geolocation & Maps tool search",
  prompt="Find OSINT tools for Geolocation & Maps.\n
    Read skills/geolocation/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Geolocation & Maps investigation: [target]",
  prompt="Investigate using Geolocation & Maps tools: [target]\n\n
    Primary: Read skills/geolocation/references/tools.md\n
    Secondary: Read skills/images-videos/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with passive image analysis and coordinate extraction before
    querying map platforms."
)
```
