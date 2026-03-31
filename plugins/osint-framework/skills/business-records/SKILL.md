---
name: business-records
description: >-
  Corporate filings, annual reports, SEC data, company research, and organizational intelligence.
  Use when the user mentions: company research, business lookup, SEC filing, corporate records,
  annual report, company information, OpenCorporates, Companies House, Crunchbase, corporate structure.
user-invocable: false
---

# Business Records

Corporate filings, annual reports, SEC data, company research,
employee profiles, and organizational intelligence across global
jurisdictions.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/business-records/references/tools.md` for the complete
list of 28 free tools in this category.

## Web Resources

| Resource | URL | Best For |
|----------|-----|----------|
| SEC EDGAR | https://www.sec.gov/cgi-bin/browse-edgar | US public company filings (10-K, 10-Q, 8-K) |
| OpenCorporates | https://opencorporates.com/ | 200M+ companies across 200+ jurisdictions (API) |
| Companies House | https://beta.companieshouse.gov.uk/ | UK company registry, officers, filings (API) |
| Crunchbase | https://www.crunchbase.com/ | Startup funding, investors, acquisitions (API) |
| LittleSis | https://littlesis.org/ | Power relationship mapping (API) |
| Google Finance | https://www.google.com/finance/ | Stock data, financial summaries |
| AnnualReports.com | https://www.annualreports.com/ | Public company annual reports |
| Company Data Rex | https://www.cdrex.com/ | Cross-border EU company research |
| Europages | https://www.europages.co.uk/ | European B2B company directory (3M+ companies) |
| International Registries | https://www.gov.uk/government/publications/overseas-registries/overseas-registries | Official registry links by country |
| Buzzfile | https://www.buzzfile.com/ | US business profiles by SIC code |
| RecruitEm | https://recruiting.net/ | X-Ray search LinkedIn/GitHub profiles |
| EU VIES VAT | https://ec.europa.eu/taxation_customs/vies/ | EU VAT number validation (API) |
| Rusprofile | https://www.rusprofile.ru/ | Russian company registry data |

## Subcategories

- **Annual Reports** -- Public company financial reports and investor documents
- **SEC Filings** -- 10-K, 10-Q, 8-K, proxy statements, insider transactions
- **Company Profiles** -- Registration data, officers, addresses across jurisdictions
- **Employee / Executive Research** -- LinkedIn X-Ray, professional profiles, org charts
- **International Registries** -- UK, EU, Russian, Swiss, and global company registers
- **Corporate Relationships** -- Board memberships, political donations, power networks
- **Patents / Trademarks** -- Intellectual property associated with companies

## Investigation Workflow

1. **Identify the entity**: Search SEC EDGAR company_tickers.json by ticker, then by company name if ticker fails. For non-US: try OpenCorporates (API key), Companies House (UK), or web search
2. **SEC EDGAR filings**: Query by CIK for 10-K, 10-Q, 20-F (foreign filers), 8-K. Note: OTC/ADR tickers (RHHBY, LVMHF, etc.) may not match — search by full company name as fallback
3. **Domain inference**: Infer the primary domain from the company name (e.g., CIBC -> cibc.com). Run WHOIS, DNS, subfinder
4. **Email infrastructure**: Check MX records to identify email provider (Microsoft 365, Google Workspace, Proofpoint, self-hosted)
5. **SaaS stack discovery**: Parse TXT records for service verifications (Google, Adobe, Atlassian, DocuSign, Salesforce, MongoDB, AWS, Stripe)
6. **DMARC policy**: Query `_dmarc.{domain}` TXT for email authentication policy
7. **Subdomain enumeration**: Run subfinder. If 0 results, fallback to crt.sh certificate transparency
8. **IP and hosting**: Resolve A records, geolocate via ipinfo.io, identify CDN/hosting (Akamai, Cloudflare, AWS, Azure)
9. **Relationships**: Map power networks via LittleSis (board memberships, donors)
10. **Cross-reference**: Pivot to `compliance-risk` for sanctions screening

## curl / API Patterns

### SEC EDGAR -- Step 1: Find Company CIK (no key required)

```bash
# Look up CIK from company name using the tickers file
COMPANY="canadian imperial bank"
curl -s "https://www.sec.gov/files/company_tickers.json" \
  -H "User-Agent: OSINTFramework history-a129f0a811a8@example.com" \
  | jq --arg q "$COMPANY" '[to_entries[].value | select(.title | ascii_downcase | test($q))]'
```

### SEC EDGAR -- Fallback: Search by Ticker (handles OTC/ADR tickers)

```bash
# If company name search fails, try exact ticker match
TICKER="CM"
curl -s "https://www.sec.gov/files/company_tickers.json" \
  -H "User-Agent: OSINTFramework history-a129f0a811a8@example.com" \
  | jq --arg t "$TICKER" '[to_entries[].value | select(.ticker == $t)]'
```

### SEC EDGAR -- Step 2: Get Filings by CIK (no key required)

```bash
# Replace CIK with the value from Step 1 (zero-padded to 10 digits)
CIK="0001045520"
curl -s "https://data.sec.gov/submissions/CIK${CIK}.json" \
  -H "User-Agent: OSINTFramework history-a129f0a811a8@example.com" \
  | jq '{name, cik, tickers, exchanges, sic, sicDescription, filings: {forms: .filings.recent.form[:10], dates: .filings.recent.filingDate[:10]}}'
```

### OpenCorporates -- Company Search (API key required)

```bash
if [ -n "${OPENCORPORATES_API_KEY:-}" ]; then
  curl -s "https://api.opencorporates.com/v0.4/companies/search?q=acme+corp&api_token=${OPENCORPORATES_API_KEY}" \
    | jq '.results.companies[] | {name: .company.name, jurisdiction: .company.jurisdiction_code, status: .company.current_status}'
else
  echo "[skip] OpenCorporates requires API key (set OPENCORPORATES_API_KEY)"
fi
```

### Companies House UK -- Company Details (API key required)

```bash
if [ -n "${COMPANIES_HOUSE_API_KEY:-}" ]; then
  curl -s "https://api.company-information.service.gov.uk/company/00000001" \
    -H "Authorization: Basic $(echo -n "${COMPANIES_HOUSE_API_KEY}:" | base64)" \
    | jq '{company_name, company_status, type, date_of_creation, registered_office_address}'
else
  echo "[skip] Companies House requires API key (set COMPANIES_HOUSE_API_KEY)"
fi
```

### Domain Inference and Infrastructure Discovery

When investigating a company, infer the domain and run full infrastructure discovery:

```bash
DOMAIN="cibc.com"

# WHOIS
whois "$DOMAIN" 2>/dev/null | grep -iE '(registra|creation|expir|name server)' | head -10

# DNS records
for rtype in A MX NS TXT; do echo "--- $rtype ---"; dig "$DOMAIN" "$rtype" +short; done

# DMARC policy (email authentication)
dig "_dmarc.$DOMAIN" TXT +short

# Email provider (from MX)
dig "$DOMAIN" MX +short | head -1

# SaaS stack (from TXT records)
dig "$DOMAIN" TXT +short | grep -oiE 'google|facebook|microsoft|atlassian|adobe|docusign|salesforce|hubspot|zendesk|stripe|mongodb|aws|cloudflare'

# Subdomains (with crt.sh fallback)
SUBS=$(subfinder -d "$DOMAIN" -silent -rls 5 2>/dev/null | wc -l)
if [ "$SUBS" -eq 0 ]; then
  echo "subfinder returned 0 — falling back to crt.sh"
  curl -s "https://crt.sh/?q=%25.$DOMAIN&output=json" | jq -r '.[].name_value' | sed 's/\*\.//g' | sort -u
fi

# IP and hosting
IP=$(dig "$DOMAIN" A +short | head -1)
curl -s "https://ipinfo.io/$IP/json" | jq '{ip, org, city, country}'
```

### EU VIES -- VAT Number Validation

```bash
curl -s "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/DE/vat/123456789" \
  | jq '{valid, name, address}'
```

### LittleSis -- Entity Relationships

```bash
curl -s "https://littlesis.org/api/entities/search?q=goldman+sachs" \
  | jq '.data[] | {name: .attributes.name, type: .attributes.primary_ext, blurb: .attributes.blurb}'
```

## Cross-Category Pivots

| When you find... | Pivot to | Why |
|------------------|----------|-----|
| Company domain in filings | `domain-recon` | WHOIS, DNS, subdomains, technology stack |
| Officers or executives | `people-search` | Personal records, social profiles |
| Sanctions or regulatory flags | `compliance-risk` | OFAC, PEP screening, beneficial ownership |
| Company address | `geolocation` | Verify physical location, satellite imagery |
| Court cases in filings | `public-records` | Detailed dockets, opinions, outcomes |
| Intellectual property | `public-records` | USPTO patent details, Google Patents |

## OPSEC Notes

- Most tools are **passive** -- no target notification
- LinkedIn and XING are **active** -- profile views may be logged
- SEC EDGAR requires a User-Agent header with contact email (policy, not authentication)
- Companies House API requires free registration; usage is tracked
- Crunchbase API requires registration and has rate limits
- OpenCorporates free tier has limited API calls; consider caching results
- RecruitEm generates Google dork queries -- the Google search itself is logged
- Use research-dedicated accounts for registration-required services

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Business Records tool search",
  prompt="Find OSINT tools for Business Records.\n
    Read skills/business-records/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Business Records investigation: [target]",
  prompt="Investigate using Business Records tools: [target]\n\n
    Primary: Read skills/business-records/references/tools.md\n
    Secondary: Read skills/compliance-risk/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with OpenCorporates and SEC EDGAR, then expand to jurisdiction-specific registries."
)
```
