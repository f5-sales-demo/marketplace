# Geolocation Tools / Maps — OSINT Tools Reference

> Auto-generated from arf.json. 47 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Geolocation Tools
- Coordinates
- Map Reporting Tools
- Mobile Coverage

---

### Astrometry

- **URL**: <https://nova.astrometry.net/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Geolocating night sky photos by star patterns
- **Input**: Astronomical image
- **Output**: Solved coordinates, orientation, and object annotations
- **Description**: Astrometry.net solves star-field images to estimate where and when a photo was taken.

### SunCalc

- **URL**: <https://suncalc.net/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Shadow-based time and location validation
- **Input**: Date/time and coordinates
- **Output**: Sun azimuth/elevation and daylight phase data
- **Description**: Solar position calculator for estimating time and orientation from shadows in imagery.

### SunCalc (Subcategories)

- **URL**: <https://suncalc.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Shadow-based time and location validation
- **Input**: Date/time and coordinates
- **Output**: Sun azimuth/elevation and daylight phase data
- **Description**: Solar position calculator for estimating time and orientation from shadows in imagery.

### GeoSpy

- **URL**: <https://geospy.ai/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Rapid initial geolocation hypotheses from photos
- **Input**: Image file
- **Output**: Likely geographic region or coordinate candidates
- **Description**: AI-assisted image geolocation tool for estimating where a photo was taken.

### GPSVisualizer

- **URL**: <https://www.gpsvisualizer.com/geocode>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Converting and visualizing GPS/coordinate inputs
- **Input**: Coordinates, GPX/KML/CSV, or addresses
- **Output**: Mapped tracks, converted coordinates, and geocode results
- **Description**: Coordinate and GPS utility for mapping, conversion, and geocoding operations.

### Military Grid Reference System Coordinates

- **URL**: <https://dominoc925-pages.appspot.com/mapplets/cs_mgrs.html>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Converting MGRS values to lat/lon and back
- **Input**: MGRS or decimal coordinate values
- **Output**: Converted coordinates in requested format
- **Description**: MGRS coordinate conversion utility for military-style grid references.

### Batch Geocoding

- **URL**: <https://www.doogal.co.uk/BatchGeocoding>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Converting large address datasets to coordinates
- **Input**: Address list (CSV/text)
- **Output**: Coordinates with match quality metadata
- **Description**: Bulk geocoding workflow that converts large address lists into latitude/longitude pairs.

### Batch Reverse Geocoding

- **URL**: <https://www.doogal.co.uk/BatchReverseGeocoding>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Converting large coordinate sets into addresses
- **Input**: Latitude/longitude list
- **Output**: Address records, admin boundaries, and place labels
- **Description**: Bulk reverse-geocoding workflow that converts coordinate lists into human-readable addresses.

### Hyperlapse (T)

- **URL**: <https://github.com/TeehanLax/Hyperlapse.js>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Generating time-lapse style Street View sequences
- **Input**: Route coordinates and animation settings
- **Output**: Embeddable hyperlapse animation
- **Description**: Open-source JavaScript library for creating Street View hyperlapse animations.

### Google Maps Streetview Player

- **URL**: <https://brianfolts.com/driver/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Walking through street-level imagery along a route
- **Input**: Street View route or map location
- **Output**: Sequenced street-level imagery playback
- **Description**: Street View path playback utility for reviewing route-level imagery sequences.

### ScribbleMaps

- **URL**: <https://www.scribblemaps.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Producing and sharing annotated investigative maps
- **Input**: Base map with custom markers/shapes/notes
- **Output**: Shareable annotated maps and exportable map views
- **Description**: Collaborative web map editor for annotations, overlays, and shared incident maps.

### Beholder

- **URL**: <https://beholder.infragard.io/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Monitoring geolocated crisis and event signals in real time
- **Input**: Map filters and geographic area
- **Output**: Mapped events with source context and timelines
- **Description**: Real-time global event map aggregating public-source signals for situational awareness.

### LiveUaMap

- **URL**: <https://liveuamap.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Conflict and crisis event geolocation tracking
- **Input**: Region and event filters
- **Output**: Mapped incidents with timeline and source context
- **Description**: Conflict/event mapping platform that geolocates incidents from public reporting.

### OpenSignal

- **URL**: <https://www.opensignal.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Comparing cellular signal quality by carrier and location
- **Input**: Location and carrier filters
- **Output**: Coverage heatmaps, speed stats, and signal indicators
- **Description**: Crowdsourced mobile coverage and signal quality map from user telemetry.

### AntennaSearch

- **URL**: <https://www.antennasearch.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Identifying nearby antenna structures and tower owners
- **Input**: Location, address, or coordinates
- **Output**: Antenna/tower records with ownership and registration details
- **Description**: FCC-backed lookup for antenna structure and tower records used in RF and telecom investigations.

### OpenCelliD

- **URL**: <https://opencellid.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Cell tower identification and approximate location triangulation
- **Input**: Cell identifiers or coordinates
- **Output**: Cell tower records and geographic positions
- **Description**: Collaborative global cell-tower database used for telecom-based geolocation.

### beaconDB

- **URL**: <https://beacondb.net/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Beacon and AP-based geolocation without major platform lock-in
- **Input**: BSSID/cell IDs or coordinates
- **Output**: Geolocated beacon and network records
- **Description**: Open geolocation database for Wi-Fi/Bluetooth/cell beacons used in location inference.

### Google Maps

- **URL**: <https://www.google.com/maps/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: General geolocation, routing, and POI correlation
- **Input**: Address, coordinates, or place query
- **Output**: Map views, directions, and POI results
- **Description**: Google web mapping suite with satellite, terrain, route, and place intelligence layers.

### Bing Maps

- **URL**: <https://www.bing.com/maps>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: General geolocation and route context with Microsoft map data
- **Input**: Address, place name, or coordinates
- **Output**: Map views, routes, and nearby POI results
- **Description**: Microsoft web mapping service with road, aerial, and route layers for location analysis.

### HERE Maps

- **URL**: <https://maps.here.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Commercial-grade map and route analysis
- **Input**: Address, coordinates, or route parameters
- **Output**: Maps, directions, traffic, and location context
- **Description**: Enterprise-grade mapping platform with routing and global cartographic coverage.

### Dual Maps

- **URL**: <https://data.mashedworld.com/dualmaps/map.htm>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Comparing two map layers or providers at the same location
- **Input**: Location or coordinates
- **Output**: Synchronized side-by-side map views
- **Description**: Dual-pane map viewer for side-by-side comparison of basemaps and imagery.

### Instant Google Street View

- **URL**: <https://www.instantstreetview.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick street-level reconnaissance from an address or coordinate
- **Input**: Address, place, or coordinates
- **Output**: Direct Street View scene and navigable panorama
- **Description**: Fast launcher for jumping directly into Google Street View at precise locations.

### OpenStreetMap

- **URL**: <https://www.openstreetmap.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Open basemap and geospatial reference without vendor lock-in
- **Input**: Location query or coordinates
- **Output**: Map features, POIs, and open geodata layers
- **Description**: Open-source global map edited by the community and widely reused in OSINT workflows.

### Flash Earth

- **URL**: <https://zoom.earth/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Fast satellite and weather imagery review
- **Input**: Map position and time controls
- **Output**: Recent satellite/weather imagery views
- **Description**: Zoom Earth interface for rapidly reviewing weather and satellite imagery timelines.

### Historic Aerials

- **URL**: <https://www.historicaerials.com/?javascript=&>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Comparing land and infrastructure changes over decades
- **Input**: Location and year filters
- **Output**: Time-series aerial imagery and map overlays
- **Description**: Historical aerial imagery archive for property and infrastructure change analysis.

### Google Maps Update Alerts

- **URL**: <https://followyourworld.appspot.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Tracking imagery refreshes for watched locations
- **Input**: Selected map locations
- **Output**: Email/location alerts when imagery updates occur
- **Description**: Follow Your World alert utility for notifications on map and imagery updates.

### Google Earth Overlays

- **URL**: <https://www.mgmaps.com/kml/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Overlaying external KML/KMZ intelligence layers on earth imagery
- **Input**: KML/KMZ overlay files and map position
- **Output**: Composited imagery with custom overlay layers
- **Description**: Overlay workflow for layering KML/KMZ data onto Google Earth views.

### Yandex.Maps

- **URL**: <https://yandex.com/maps/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Geolocation research in Russia/CIS where western maps are weaker
- **Input**: Address/place query or coordinates
- **Output**: Map imagery, routes, and regional POI context
- **Description**: Regional mapping service with strong coverage in Russia and surrounding regions.

### Google Earth

- **URL**: <https://earth.google.com/web/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Historical satellite and terrain review in 3D
- **Input**: Location, polygons, and time slider controls
- **Output**: 3D imagery, overlays, and historical context
- **Description**: 3D globe and historical imagery platform for terrain and time-based visual analysis.

### Baidu Maps

- **URL**: <https://map.baidu.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Geolocation and POI discovery in mainland China
- **Input**: Address, place name, or coordinates
- **Output**: Map layers, routes, POIs, and location context
- **Description**: Major Chinese mapping platform with strong POI and routing coverage in mainland China.

### Corona

- **URL**: <https://corona.cast.uark.edu/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Cold War-era historical imagery analysis
- **Input**: Location and archive filters
- **Output**: Historical satellite imagery and metadata
- **Description**: Access point for historical CORONA-era satellite imagery used in long-range change analysis.

### Naver (Korean)

- **URL**: <https://map.naver.com/p/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Geolocation and POI analysis in South Korea
- **Input**: Address/place query or coordinates
- **Output**: Map layers, routes, local business/POI data
- **Description**: Korea-focused mapping platform with strong local POI and transit coverage.

### OpenStreetMap (Subcategories)

- **URL**: <https://www.openstreetmap.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Open basemap and geospatial reference without vendor lock-in
- **Input**: Location query or coordinates
- **Output**: Map features, POIs, and open geodata layers
- **Description**: Open-source global map edited by the community and widely reused in OSINT workflows.

### Overpass Turbo

- **URL**: <https://overpass-turbo.eu/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Custom extraction of OSM entities by tags and geography
- **Input**: Overpass query and map bounds
- **Output**: Filtered OSM features (map/GeoJSON/KML)
- **Description**: Query interface for extracting targeted OpenStreetMap features via Overpass API.

### EarthExplorer

- **URL**: <https://earthexplorer.usgs.gov/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Downloading historical and multispectral satellite datasets
- **Input**: AOI, date range, and dataset criteria
- **Output**: Search results with downloadable geospatial scenes
- **Description**: USGS portal for Landsat, Sentinel, and other earth observation datasets.

### OpenStreetCam

- **URL**: <https://kartaview.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Street-level image review outside mainstream Street View coverage
- **Input**: Location and route filters
- **Output**: Crowdsourced geotagged street imagery
- **Description**: KartaView crowdsourced street-level imagery platform for geospatial verification.

### Travel by Drone

- **URL**: <https://travelbydrone.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Planning drone-oriented visual reconnaissance paths
- **Input**: Location and route preferences
- **Output**: Mapped route and aerial travel context
- **Description**: Drone-route and aerial exploration resource useful for planning vantage-aware terrain review.

### Hivemapper

- **URL**: <https://hivemapper.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Street-level imagery in areas with limited mainstream coverage
- **Input**: Location query
- **Output**: Crowdsourced map and imagery tiles
- **Description**: Decentralized, crowdsourced street imagery map network with expanding coverage.

### LandsatLook Viewer

- **URL**: <https://landsatlook.usgs.gov/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Long-term environmental and infrastructure change detection
- **Input**: Location/date filters and band selections
- **Output**: Rendered Landsat scenes and metadata
- **Description**: USGS viewer for browsing Landsat scenes and multispectral imagery.

### NEXRAD Data Inventory Search

- **URL**: <https://www.ncdc.noaa.gov/nexradinv/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Locating radar archives for weather-event correlation
- **Input**: Radar station, date, and query filters
- **Output**: Inventory records and radar dataset references
- **Description**: NOAA/NCDC index for searching archived NEXRAD radar datasets.

### MapQuest

- **URL**: <https://www.mapquest.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Route analysis and multi-stop planning
- **Input**: Origin, destination, and stop list
- **Output**: Turn-by-turn routes and distance metrics
- **Description**: Web mapping and routing platform supporting multi-stop route planning.

### OpenRailwayMap

- **URL**: <https://www.openrailwaymap.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Rail network and station infrastructure mapping
- **Input**: Location and zoom level
- **Output**: Railway overlays, stations, and track details
- **Description**: Rail-specific map layer showing tracks, stations, and related rail infrastructure.

### OpenInfrastructureMap

- **URL**: <https://openinframap.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Infrastructure mapping across energy and utility networks
- **Input**: Location and layer toggles
- **Output**: Infrastructure overlays on an interactive map
- **Description**: OSM-derived map overlays for power, telecom, water, and industrial infrastructure.

### Hiking & Biking Map

- **URL**: <https://hikebikemap.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Outdoor trail and route reconnaissance
- **Input**: Location or route area
- **Output**: Trail-focused map overlays and terrain context
- **Description**: OSM-based map optimized for trails, cycling routes, and terrain context.

### US Nav Guide ZIP Code Data

- **URL**: <https://www.usnaviguide.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Linking US ZIP codes to geographic lookup context
- **Input**: US ZIP code or city/state query
- **Output**: Zip-associated geographic and lookup reference data
- **Description**: Zip-code lookup resource for correlating US postal areas with map context.

### Wayback Imagery

- **URL**: <https://livingatlas.arcgis.com/wayback/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Recent-era imagery change detection across archived basemap releases
- **Input**: Location and imagery version selection
- **Output**: Historical basemap snapshots by release date
- **Description**: Esri Wayback archive for reviewing previous versions of world imagery basemaps.

### SkyFi.com - Satellite Open Data (R)

- **URL**: <https://app.skyfi.com/explore/open>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Finding open and commercial satellite scenes from one interface
- **Input**: AOI, date range, and scene filters
- **Output**: Scene search results with preview and ordering options
- **Description**: Satellite imagery marketplace and open-data discovery interface for earth observation assets.
