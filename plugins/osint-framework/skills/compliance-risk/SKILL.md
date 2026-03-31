---
name: compliance-risk
description: >-
  Sanctions screening, PEP checks, regulatory compliance, and risk assessment tools.
  Use when the user mentions: sanctions check, PEP screening, compliance, AML, KYC,
  regulatory risk, OFAC, beneficial ownership, offshore, money laundering, watchlist.
user-invocable: false
---

# Compliance & Risk Intelligence

Sanctions screening, PEP checks, AML/KYC due diligence, beneficial
ownership tracing, and regulatory compliance research.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Compliance
screening results are informational and do not constitute legal advice.

## Tools Reference

Read `skills/compliance-risk/references/tools.md` for the complete
list of 18 free tools in this category.

## Web Resources

| Resource | URL | Best For |
|----------|-----|----------|
| OpenSanctions | https://www.opensanctions.org/ | Consolidated global sanctions/PEP data (API) |
| OFAC Sanctions Search | https://sanctionssearch.ofac.treas.gov/ | US Treasury SDN list screening |
| EU Sanctions Tool | https://sanctions-tool.ec.europa.eu | EU restrictive measures screening |
| ICIJ Offshore Leaks | https://offshoreleaks.icij.org/ | Panama/Paradise/Pandora Papers (API) |
| OCCRP Aleph | https://aleph.occrp.org/ | Cross-reference leaks and public records (API) |
| OpenOwnership | https://www.openownership.org/ | Beneficial ownership chains (API) |
| Companies House | https://find-and-update.company-information.service.gov.uk/ | UK company and director data (API) |
| OpenScreening | https://resources.linkurious.com/openscreening | Graph visualization of entity relationships |
| NameScan | https://namescan.io | Sanctions/PEP/adverse media screening (API) |
| dilisense | https://dilisense.com/en | AML/KYC screening with fuzzy matching (API) |
| PepChecker | https://pepchecker.com | PEP and sanctions screening (API) |
| EveryPolitician | https://everypolitician.org/ | Global political office-holder data (API) |

## Subcategories

- **Sanctions Screening** -- OFAC, EU, UN consolidated sanctions list checks
- **PEP (Politically Exposed Persons)** -- Political office-holder identification and risk flags
- **AML / KYC** -- Anti-money laundering and know-your-customer due diligence
- **Beneficial Ownership** -- Corporate ownership chain tracing across jurisdictions
- **Regulatory / OFAC** -- US and international regulatory compliance verification
- **Offshore / Leaks** -- Panama Papers, Paradise Papers, Pandora Papers investigation

## Investigation Workflow

1. **Initial screening**: Run subject name through OpenSanctions API for consolidated watchlist check
2. **OFAC check**: Verify against US Treasury SDN list at sanctionssearch.ofac.treas.gov
3. **EU screening**: Cross-check against EU sanctions tool for European designations
4. **PEP check**: Query EveryPolitician and PepChecker for political exposure
5. **Beneficial ownership**: Trace corporate chains via OpenOwnership and Companies House
6. **Offshore exposure**: Search ICIJ Offshore Leaks for shell company connections
7. **Deep investigation**: Query OCCRP Aleph for cross-referenced leaks and public records
8. **Visualize**: Use OpenScreening to map entity relationships graphically
9. **Cross-reference**: Pivot to `business-records` for corporate filings, `public-records` for court cases

## curl / API Patterns

### OpenSanctions -- Entity Search

```bash
curl -s "https://api.opensanctions.org/search/default?q=John+Smith&limit=5" \
  -H "Authorization: ApiKey YOUR_KEY" \
  | jq '.results[] | {id, caption, schema, datasets}'
```

### ICIJ Offshore Leaks -- Search Entities

```bash
curl -s "https://offshoreleaks.icij.org/api/v1/search?q=company+name&limit=10" \
  | jq '.[] | {entity, jurisdiction, linked_to, source}'
```

### Companies House UK -- Company Search

```bash
curl -s "https://api.company-information.service.gov.uk/search/companies?q=acme+ltd" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
  | jq '.items[] | {title, company_number, company_status, date_of_creation}'
```

### Companies House UK -- Officer Search

```bash
curl -s "https://api.company-information.service.gov.uk/search/officers?q=john+smith" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
  | jq '.items[] | {title, appointed_to, date_of_birth}'
```

### OCCRP Aleph -- Cross-Reference Search

```bash
curl -s "https://aleph.occrp.org/api/2/search?q=target+name" \
  -H "Authorization: ApiKey YOUR_KEY" \
  | jq '.results[] | {id, schema, properties}'
```

### OpenOwnership -- Beneficial Ownership Lookup

```bash
curl -s "https://api.openownership.org/api/v1/entities?q=company+name" \
  | jq '.results[] | {name, type, jurisdiction, identifiers}'
```

### EU VIES VAT Validation (via SOAP, simplified)

```bash
curl -s "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/GB/vat/123456789" \
  | jq '{valid, name, address}'
```

## Cross-Category Pivots

| When you find... | Pivot to | Why |
|------------------|----------|-----|
| Corporate entity on sanctions list | `business-records` | Full SEC filings, officers, financial history |
| Individual flagged as PEP | `public-records` | Court records, property, campaign finance |
| Offshore shell company | `domain-recon` | Website analysis, hosting, registration |
| Suspicious financial activity | `threat-intelligence` | Threat actor associations, dark web mentions |
| Subject's business address | `geolocation` | Physical location verification |

## OPSEC Notes

- All screening tools listed are **passive** -- no target notification
- OpenSanctions and OCCRP Aleph require API keys that track usage
- OFAC and EU sanctions tools are government-hosted; access may be logged
- Companies House API requires registration but is free
- Do not store or redistribute sanctioned entity data without legal review
- Use research-dedicated accounts for registration-required services
- Offshore leaks searches at ICIJ do not notify named entities
- Screen results are point-in-time; sanctions lists update frequently

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Compliance & Risk Intelligence tool search",
  prompt="Find OSINT tools for Compliance & Risk Intelligence.\n
    Read skills/compliance-risk/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Compliance & Risk Intelligence investigation: [target]",
  prompt="Investigate using Compliance & Risk Intelligence tools: [target]\n\n
    Primary: Read skills/compliance-risk/references/tools.md\n
    Secondary: Read skills/business-records/references/tools.md\n
    Execute sanctions screening via OpenSanctions API, check OFAC,
    trace beneficial ownership, query ICIJ Offshore Leaks.\n
    Start with sanctions screening before deeper ownership analysis."
)
```
