---
name: public-records
description: >-
  Government records, court filings, property records, voter data, and public document search.
  Use when the user mentions: public records, court records, property records, voter, government records, FOIA,
  patent search, tax records, death records, birth records, inmate search, campaign finance.
user-invocable: false
---

# Public Records

Government records, court filings, property records, voter data,
birth/death records, patents, tax information, and FOIA resources.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Court records and
voter data may have jurisdiction-specific access restrictions.

## Tools Reference

Read `skills/public-records/references/tools.md` for the complete
list of 45 free tools in this category.

## Web Resources

| Resource | URL | Best For |
| ---------- | ----- | ---------- |
| judyrecords | <https://www.judyrecords.com/> | Nationwide court case search (760M+ cases) |
| CourtListener | <https://courtlistener.com/> | Federal court opinions, dockets, RECAP data |
| Caselaw Access Project | <https://case.law/> | Historical legal opinions (6M+ decisions) |
| OFAC Sanctions Search | <https://sanctionssearch.ofac.treas.gov/> | OFAC SDN list search |
| OpenSecrets | <https://www.opensecrets.org/> | Campaign finance and lobbying data |
| FEC Data | <https://fec.gov/data> | Federal campaign finance disclosures |
| USPTO Patent Search | <https://www.uspto.gov/patents/search> | US patent and trademark lookup |
| Google Patents | <https://patents.google.com/> | International patent research |
| Black Book Online | <https://www.blackbookonline.info/> | 37K+ record types aggregation |
| NETR Online | <https://publicrecords.netronline.com/> | County property records portal |
| Regrid | <https://regrid.com> | Parcel mapping and property data (API) |
| Find A Grave | <https://www.findagrave.com/> | Cemetery records (615M+ graves) |
| BOP Inmate Locator | <https://www.bop.gov/inmateloc/> | Federal inmate search |
| NACo County Explorer | <https://explorer.naco.org/> | 1000+ county demographic indicators |
| World Bank Open Data | <https://datacatalog.worldbank.org/> | Global development data (API) |
| EveryPolitician | <https://everypolitician.org/> | Global politician data (API) |

## Subcategories

- **Property Records** -- Parcel data, deed history, tax assessments, ownership
- **Court / Criminal Records** -- Case filings, dockets, mugshots, inmate search
- **Voter Data** -- Registration verification, voting history by state
- **Birth / Death Records** -- Vital records, obituaries, cemetery databases
- **Patent Records** -- US and international patent search, inventor lookup
- **Tax / Financial** -- Public salary databases, VAT verification
- **Government Open Data** -- US, Canadian, German federal data portals
- **Political Records** -- Campaign finance, lobbying disclosures, politician profiles
- **FOIA** -- Freedom of Information Act request guidance and tracking

## Investigation Workflow

1. **Identify jurisdiction**: Determine federal, state, or county scope
2. **Court records**: Search judyrecords for case names, then CourtListener/RECAP for documents
3. **Property records**: Use NETR Online to find the county assessor, then Regrid for parcel data
4. **Criminal records**: Check BOP Inmate Locator (federal), state DOC sites, mugshot databases
5. **Financial / political**: Query OpenSecrets and FEC for campaign contributions
6. **Patents**: Search USPTO or Google Patents by inventor name or keyword
7. **Vital records**: Check death indices, Find A Grave for deceased confirmation
8. **Cross-reference**: Pivot to `people-search` for identity, `business-records` for corporate ties

## cURL / API Patterns

### CourtListener API -- Search Opinions

```bash
curl -s "https://www.courtlistener.com/api/rest/v4/search/?q=defendant+name&type=o" \
  -H "Authorization: Token $TOKEN" | jq '.results[:3]'
```

### Caselaw Access Project -- Search Cases

```bash
curl -s "https://api.case.law/v1/cases/?search=smith+v+jones&jurisdiction=us" \
| jq '.results[] |
```

### NHTSA VIN Decode (cross-reference vehicle in court records)

```bash
curl -s "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/1HGCM82633A004352?format=json" \
| jq '.Results[] | select(.Value != "" and .Value != null) |
```

### FEC Candidate Search

```bash
curl -s "https://api.open.fec.gov/v1/candidates/search/?q=smith&api_key=DEMO_KEY" \
| jq '.results[] |
```

### OpenSecrets Legislator Search

```bash
curl -s "https://www.opensecrets.org/api/?method=getLegislators&id=NJ&apikey=$API_KEY&output=json" \
  | jq '.response.legislator[]'
```

### World Bank Indicator Query

```bash
curl -s "https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=5" \
| jq '.[1][] |
```

## Cross-Category Pivots

| When you find... | Pivot to | Why |
| ------------------ | ---------- | ----- |
| Person name in court records | `people-search` | Verify identity, find addresses and aliases |
| Company named in filings | `business-records` | SEC filings, corporate structure, officers |
| Financial irregularities | `compliance-risk` | Sanctions screening, PEP checks |
| Property address | `geolocation` | Satellite imagery, neighborhood context |
| Phone/email in records | `phone-recon`, `email-recon` | Trace contact information |

## OPSEC Notes

- All tools listed are **passive** -- no target notification
- Court record searches may be logged by court systems (PACER tracks access)
- Voter data access varies by state; some require justification
- FOIA requests create a paper trail connecting you to the inquiry
- Use a research-dedicated browser profile for records sites that track visitors
- Some property record sites (Redfin, Regrid) may log IP-based search patterns

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Public Records tool search",
  prompt="Find OSINT tools for Public Records.\n
    Read skills/public-records/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Public Records investigation: [target]",
  prompt="Investigate using Public Records tools: [target]\n\n
    Primary: Read skills/public-records/references/tools.md\n
    Secondary: Read skills/people-search/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with court records and property records before broader searches."
)
```
