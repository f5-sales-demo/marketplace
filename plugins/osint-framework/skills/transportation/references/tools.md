# Transportation — OSINT Tools Reference

> Auto-generated from arf.json. 21 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Vehicle Records
- Air Traffic Records
- Marine Records
- Railway Records

---

### MyAccident - traffic accident map

- **URL**: <https://myaccident.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: US accident history verification and claims investigations
- **Input**: Accident location, address, or basic vehicle details
- **Output**: Redacted accident reports, crash severity, and location data
- **Description**: Free database of redacted US traffic accident reports with searchable crash records and location details.

### NHTSA Vehicle API

- **URL**: <https://vpic.nhtsa.dot.gov/api/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: VIN decoding and US vehicle specification checks
- **Input**: 17-character VIN (full or partial with wildcards)
- **Output**: Make, model, year, manufacturer, engine details, and related data
- **Description**: Official US government VIN decoder API with vehicle specification and manufacturer data for model years 1981 onward.

### FindByPlate

- **URL**: <https://findbyplate.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: US license plate-based vehicle investigations
- **Input**: US license plate number and state
- **Output**: Vehicle make, model, year, and limited ownership hints
- **Description**: US license plate lookup service for basic vehicle identification and ownership-related investigation leads.

### autoDNA VIN Lookup

- **URL**: <https://www.autodna.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: VIN-based damage, ownership, and service history checks
- **Input**: 17-character VIN
- **Output**: Inspection, damage, repair, ownership, and mileage records
- **Description**: Vehicle history lookup platform with records from European and North American markets and paid report expansion.

### VinDecodr

- **URL**: <https://vindecodr.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Rapid vehicle specification lookup from VIN values
- **Input**: 17-character VIN
- **Output**: Vehicle make, model, year, engine, and recall-related details
- **Description**: Free VIN decoder for quick extraction of standard vehicle characteristics from 17-character VIN values.

### AutoRef (EU)

- **URL**: <https://www.autoref.eu/en>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: EU vehicle specification lookup and plate-to-VIN workflows
- **Input**: European VIN or license plate number
- **Output**: Vehicle make, model, engine, registration, and technical profile data
- **Description**: European VIN and plate intelligence service with free and paid tiers for technical vehicle profile data.

### Carnet.ai

- **URL**: <https://carnet.ai/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Vehicle identification from images in visual OSINT cases
- **Input**: Vehicle image file or image URL
- **Output**: Predicted make, model, generation year, and confidence score
- **Description**: AI vehicle image recognition platform that identifies make/model/generation from submitted photos.

### Finnik (NL)

- **URL**: <https://finnik.nl/en>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Netherlands plate investigations and inspection history checks
- **Input**: Dutch license plate number
- **Output**: Vehicle specs, APK timeline, and related ownership/tax data
- **Description**: Dutch license plate intelligence service using official RDW-linked records for vehicle profile and APK history.

### Flightradar24.com

- **URL**: <https://www.flightradar24.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Aircraft movement monitoring and flight status intelligence
- **Input**: Flight number, aircraft registration, or airport code
- **Output**: Real-time position, altitude, speed, routing, and departure/arrival status
- **Description**: Global real-time flight tracking platform built on ADS-B and radar feeds with airport and route intelligence views.

### World Aeronautical Database

- **URL**: <https://worldaerodata.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Aviation reference checks for airports, airlines, and aircraft
- **Input**: Airport code, airline, aircraft type, or route context
- **Output**: Airport details, airline profiles, and aircraft-related reference data
- **Description**: Reference database for airport, airline, and aircraft metadata to support aviation intelligence lookups.

### ADS-B Exchange

- **URL**: <https://www.adsbexchange.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Unfiltered aircraft tracking and historical flight pattern analysis
- **Input**: Aircraft identifier, registration, hex code, or location
- **Output**: Live aircraft position, altitude, speed, and historical track data
- **Description**: Large community-driven unfiltered ADS-B flight tracking network with broad global aircraft coverage.

### ADS-B.NL

- **URL**: <https://www.ads-b.nl/index.php?pageno=9999>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: European and military aircraft movement monitoring
- **Input**: Aircraft registration, military callsign, or track query
- **Output**: Flight traces, movement history, and aircraft classification context
- **Description**: Netherlands-focused ADS-B tracking portal with emphasis on military and regional aviation movements.

### OpenAIP World Aeronautical Database

- **URL**: <https://www.openaip.net/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Airspace and airfield intelligence with reusable open data
- **Input**: Airfield name, coordinates, or airspace criteria
- **Output**: Runway, frequency, elevation, navaid, and airspace structure data
- **Description**: Open, community-maintained aeronautical dataset for airfields, airspace, navaids, and runway metadata.

### Ship AIS

- **URL**: <https://shipais.uk/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: UK maritime activity monitoring and vessel identification
- **Input**: Vessel name, MMSI, or local waterway context
- **Output**: Current position, movement track, vessel details, and nearby traffic
- **Description**: UK-centered AIS ship tracker with live map views, movement details, and vessel identification data.

### OpenSeaMap - The free nautical chart

- **URL**: <https://www.openseamap.org>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Nautical geolocation and maritime infrastructure mapping
- **Input**: Coordinates, port name, or map area
- **Output**: Nautical chart overlays, navigational aids, port/marina, and depth context
- **Description**: Open nautical chart map built on collaborative maritime data for ports, aids to navigation, and coastal context.

### Vessel Finder

- **URL**: <https://www.vesselfinder.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Worldwide ship tracking and port-call timeline analysis
- **Input**: Vessel name, IMO, MMSI, or geographic area
- **Output**: Live vessel tracks, destination status, and historical route context
- **Description**: Global AIS vessel tracking service for ship positions, voyage progress, and historical movement review.

### Global Fishing Watch

- **URL**: <https://globalfishingwatch.org>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Illegal fishing detection and fisheries activity intelligence
- **Input**: Vessel name/IMO, geography, and date range
- **Output**: Fishing effort maps, vessel profiles, transshipment, and port visit patterns
- **Description**: Nonprofit maritime transparency platform that maps global fishing activity from AIS/VMS-derived signals.

### Deutsche Bahn Open-Data-Portal (German)

- **URL**: <https://data.deutschebahn.com/opendata>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: German rail infrastructure and schedule intelligence
- **Input**: Station ID, route query, or timetable parameters
- **Output**: Station metadata, track/network data, timetables, and service status
- **Description**: German rail open-data portal for station, network, timetable, and real-time transportation datasets.

### OpenRailwayMap

- **URL**: <https://www.openrailwaymap.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Rail infrastructure mapping and line characteristic analysis
- **Input**: Map coordinates, region, or railway line context
- **Output**: Track layouts, rail types, electrification, speed classes, and map overlays
- **Description**: OpenStreetMap-based global railway map visualizing rail lines, infrastructure characteristics, and operations context.

### Satellite Tracking

- **URL**: <https://www.n2yo.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Space object and satellite movement monitoring
- **Input**: Satellite name, NORAD ID, or orbital element query
- **Output**: Orbital position, pass timing, altitude, and trajectory context
- **Description**: Satellite orbit tracking entry point for monitoring spacecraft position, trajectory, and pass predictions.

### Track-Trace

- **URL**: <https://www.track-trace.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Package tracking and supply-chain movement checks
- **Input**: Tracking number and optional carrier selection
- **Output**: Shipment milestones, current location, route progress, and delivery status
- **Description**: Multi-carrier shipment tracking aggregator for parcel and freight status across global postal and logistics providers.
