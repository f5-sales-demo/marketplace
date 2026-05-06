#!/usr/bin/env bash
# Batch company investigation — stress-tests the OSINT discovery pipeline
# across 30 companies in diverse verticals.
#
# For each company, runs: SEC lookup, WHOIS, DNS, subdomains, IP geo, TXT analysis
# Logs results + gaps to a structured report.
set -eo pipefail

# shellcheck disable=SC2034
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="/tmp/osint-batch-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTDIR"

# ── Test corpus: 30 companies across verticals ──────────────
# Format: "Company Name|Domain|Vertical|Country|Ticker"
COMPANIES=(
  # Banking & Finance
  "CIBC|cibc.com|Banking|Canada|CM"
  "JPMorgan Chase|jpmorganchase.com|Banking|US|JPM"
  "HSBC|hsbc.com|Banking|UK|HSBC"
  "Deutsche Bank|db.com|Banking|Germany|DB"
  # Tech
  "Cloudflare|cloudflare.com|Tech/CDN|US|NET"
  "Shopify|shopify.com|Tech/E-commerce|Canada|SHOP"
  "SAP|sap.com|Tech/Enterprise|Germany|SAP"
  "Atlassian|atlassian.com|Tech/SaaS|Australia|TEAM"
  # Healthcare & Pharma
  "Pfizer|pfizer.com|Pharma|US|PFE"
  "Roche|roche.com|Pharma|Switzerland|RHHBY"
  "UnitedHealth|unitedhealthgroup.com|Health Insurance|US|UNH"
  # Energy & Mining
  "Shell|shell.com|Energy/Oil|Netherlands|SHEL"
  "NextEra Energy|nexteraenergy.com|Energy/Renewable|US|NEE"
  "Rio Tinto|riotinto.com|Mining|UK|RIO"
  # Retail & Consumer
  "IKEA|ikea.com|Retail/Furniture|Sweden|PRIVATE"
  "Costco|costco.com|Retail/Wholesale|US|COST"
  "LVMH|lvmh.com|Luxury|France|LVMHF"
  # Telecom
  "Vodafone|vodafone.com|Telecom|UK|VOD"
  "T-Mobile|t-mobile.com|Telecom|US|TMUS"
  # Aerospace & Defense
  "Airbus|airbus.com|Aerospace|France|EADSY"
  "Lockheed Martin|lockheedmartin.com|Defense|US|LMT"
  # Automotive
  "Toyota|toyota.com|Automotive|Japan|TM"
  "Tesla|tesla.com|Automotive/EV|US|TSLA"
  # Food & Beverage
  "Nestle|nestle.com|Food|Switzerland|NSRGY"
  "PepsiCo|pepsico.com|Beverage|US|PEP"
  # Media & Entertainment
  "Netflix|netflix.com|Streaming|US|NFLX"
  "Spotify|spotify.com|Music/Streaming|Sweden|SPOT"
  # Insurance
  "Allianz|allianz.com|Insurance|Germany|ALIZY"
  # Logistics
  "Maersk|maersk.com|Shipping/Logistics|Denmark|AMKBY"
  # Crypto/Fintech
  "Coinbase|coinbase.com|Crypto/Fintech|US|COIN"
)

# ── Discovery functions ─────────────────────────────────────

discover_sec() {
  local company="$1" ticker="$2"
  # Step 1: CIK lookup via ticker
  local cik_data
  cik_data=$(curl -s "https://www.sec.gov/files/company_tickers.json" \
    -H "User-Agent: OSINTFramework research@osint.local" 2>/dev/null)

  local cik
  cik=$(echo "$cik_data" | jq -r --arg t "$ticker" \
    '[to_entries[].value | select(.ticker == $t)] | .[0].cik_str // empty' 2>/dev/null)

  if [ -n "$cik" ] && [ "$cik" != "null" ] && [ "$ticker" != "PRIVATE" ]; then
    local padded
    padded=$(printf "%010d" "$cik")
    local filings
    filings=$(curl -s "https://data.sec.gov/submissions/CIK${padded}.json" \
      -H "User-Agent: OSINTFramework research@osint.local" 2>/dev/null)
    echo "$filings" | jq '{name, cik, tickers, exchanges, sic, sicDescription}' 2>/dev/null
    echo "SEC_STATUS:found"
  else
    echo "SEC_STATUS:not_found"
  fi
}

discover_whois() {
  local domain="$1"
  local raw
  raw=$(whois "$domain" 2>/dev/null)
  echo "$raw" | grep -iE '(registra|creation|expir|name.server|organization|admin.org)' | head -12
  if echo "$raw" | grep -qi "creation"; then
    echo "WHOIS_STATUS:found"
  else
    echo "WHOIS_STATUS:partial"
  fi
}

discover_dns() {
  local domain="$1"
  local results=""
  for rtype in A AAAA MX NS TXT; do
    local records
    records=$(dig "$domain" "$rtype" +short 2>/dev/null)
    if [ -n "$records" ]; then
      results="${results}${rtype}:$(echo "$records" | wc -l) "
    fi
  done
  echo "DNS_RECORDS: $results"

  # Extract interesting TXT insights
  local txt
  txt=$(dig "$domain" TXT +short 2>/dev/null)
  local insights=""
  echo "$txt" | grep -qi "spf" && insights="${insights}SPF "
  echo "$txt" | grep -qi "dmarc" && insights="${insights}DMARC "
  echo "$txt" | grep -qi "google-site" && insights="${insights}Google-Verified "
  echo "$txt" | grep -qi "facebook" && insights="${insights}Facebook-Verified "
  echo "$txt" | grep -qi "docusign" && insights="${insights}DocuSign "
  echo "$txt" | grep -qi "salesforce" && insights="${insights}Salesforce "
  echo "$txt" | grep -qi "hubspot" && insights="${insights}HubSpot "
  echo "$txt" | grep -qi "zendesk" && insights="${insights}Zendesk "
  echo "$txt" | grep -qi "microsoft\|MS=" && insights="${insights}Microsoft "
  echo "$txt" | grep -qi "atlassian" && insights="${insights}Atlassian "
  echo "$txt" | grep -qi "adobe" && insights="${insights}Adobe "
  echo "$txt" | grep -qi "stripe" && insights="${insights}Stripe "
  echo "$txt" | grep -qi "cloudflare" && insights="${insights}Cloudflare "
  echo "$txt" | grep -qi "aws\|amazonses" && insights="${insights}AWS "
  echo "$txt" | grep -qi "mongodb" && insights="${insights}MongoDB "
  echo "TXT_INSIGHTS: $insights"
}

discover_subdomains() {
  local domain="$1"
  local count
  count=$(timeout 45 subfinder -d "$domain" -silent -rls 5 2>/dev/null | wc -l)
  echo "SUBDOMAIN_COUNT: $count"
}

discover_ip() {
  local domain="$1"
  local ip
  ip=$(dig "$domain" A +short 2>/dev/null | head -1)
  if [ -n "$ip" ]; then
    local geo
    geo=$(curl -s "https://ipinfo.io/$ip/json" 2>/dev/null | jq -r '[.org, .city, .country] | join(", ")' 2>/dev/null)
    echo "PRIMARY_IP: $ip"
    echo "IP_GEO: $geo"
  else
    echo "PRIMARY_IP: none"
  fi
}

discover_mx_provider() {
  local domain="$1"
  local mx
  mx=$(dig "$domain" MX +short 2>/dev/null | head -1)
  local provider="Unknown"
  if echo "$mx" | grep -qi "google\|gmail\|googlemail"; then
    provider="Google Workspace"
  elif echo "$mx" | grep -qi "outlook\|microsoft\|protection.outlook"; then
    provider="Microsoft 365"
  elif echo "$mx" | grep -qi "pphosted\|proofpoint"; then
    provider="Proofpoint"
  elif echo "$mx" | grep -qi "mimecast"; then
    provider="Mimecast"
  elif echo "$mx" | grep -qi "barracuda"; then
    provider="Barracuda"
  elif echo "$mx" | grep -qi "messagelabs\|symantec"; then
    provider="Symantec"
  elif echo "$mx" | grep -qi "forcepoint"; then
    provider="Forcepoint"
  elif echo "$mx" | grep -qi "sophos"; then
    provider="Sophos"
  fi
  echo "EMAIL_PROVIDER: $provider ($mx)"
}

discover_ns_provider() {
  local domain="$1"
  local ns
  ns=$(dig "$domain" NS +short 2>/dev/null | head -1)
  local provider="Unknown"
  if echo "$ns" | grep -qi "cloudflare"; then
    provider="Cloudflare"
  elif echo "$ns" | grep -qi "awsdns\|amazonaws"; then
    provider="AWS Route53"
  elif echo "$ns" | grep -qi "google\|googledomains"; then
    provider="Google Cloud DNS"
  elif echo "$ns" | grep -qi "azure\|microsoft"; then
    provider="Azure DNS"
  elif echo "$ns" | grep -qi "akam"; then
    provider="Akamai"
  elif echo "$ns" | grep -qi "ultradns\|neustar"; then
    provider="Neustar/UltraDNS"
  elif echo "$ns" | grep -qi "domaincontrol\|godaddy"; then
    provider="GoDaddy"
  elif echo "$ns" | grep -qi "registrar-servers\|namecheap"; then
    provider="Namecheap"
  elif echo "$ns" | grep -qi "dynect\|oracle"; then
    provider="Oracle/Dyn"
  fi
  echo "DNS_PROVIDER: $provider ($ns)"
}

# ── Main loop ───────────────────────────────────────────────
echo "=== OSINT Batch Company Investigation ==="
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Companies: ${#COMPANIES[@]}"
echo "Output: $OUTDIR"
echo ""

# CSV header
echo "Company,Domain,Vertical,Country,Ticker,SEC,WHOIS,DNS_Records,TXT_Insights,Subdomains,IP,IP_Geo,Email_Provider,DNS_Provider" \
  >"$OUTDIR/summary.csv"

TOTAL=0
SEC_FOUND=0
WHOIS_FOUND=0
HIGH_SUBDOMAIN=0

for entry in "${COMPANIES[@]}"; do
  IFS='|' read -r company domain vertical country ticker <<<"$entry"
  TOTAL=$((TOTAL + 1))

  echo "--- [$TOTAL/${#COMPANIES[@]}] $company ($domain) — $vertical ---"

  # Create per-company output
  CDIR="$OUTDIR/$(echo "$domain" | tr '.' '-')"
  mkdir -p "$CDIR"

  # Run all discovery in sequence (respecting rate limits)
  echo "  SEC EDGAR..."
  sec_result=$(discover_sec "$company" "$ticker" 2>/dev/null)
  echo "$sec_result" >"$CDIR/sec.txt"
  sec_status=$(echo "$sec_result" | grep "SEC_STATUS:" | cut -d: -f2)
  [ "$sec_status" = "found" ] && SEC_FOUND=$((SEC_FOUND + 1))

  echo "  WHOIS..."
  whois_result=$(discover_whois "$domain" 2>/dev/null)
  echo "$whois_result" >"$CDIR/whois.txt"
  whois_status=$(echo "$whois_result" | grep "WHOIS_STATUS:" | cut -d: -f2)
  [ "$whois_status" = "found" ] && WHOIS_FOUND=$((WHOIS_FOUND + 1))

  echo "  DNS..."
  dns_result=$(discover_dns "$domain" 2>/dev/null)
  echo "$dns_result" >"$CDIR/dns.txt"
  dns_records=$(echo "$dns_result" | grep "DNS_RECORDS:" | sed 's/DNS_RECORDS: //')
  txt_insights=$(echo "$dns_result" | grep "TXT_INSIGHTS:" | sed 's/TXT_INSIGHTS: //')

  echo "  Subdomains..."
  sub_result=$(discover_subdomains "$domain" 2>/dev/null)
  echo "$sub_result" >"$CDIR/subdomains.txt"
  sub_count=$(echo "$sub_result" | grep "SUBDOMAIN_COUNT:" | awk '{print $2}')
  [ "${sub_count:-0}" -gt 100 ] && HIGH_SUBDOMAIN=$((HIGH_SUBDOMAIN + 1))

  echo "  IP & Geo..."
  ip_result=$(discover_ip "$domain" 2>/dev/null)
  echo "$ip_result" >"$CDIR/ip.txt"
  primary_ip=$(echo "$ip_result" | grep "PRIMARY_IP:" | sed 's/PRIMARY_IP: //')
  ip_geo=$(echo "$ip_result" | grep "IP_GEO:" | sed 's/IP_GEO: //')

  echo "  Email provider..."
  mx_result=$(discover_mx_provider "$domain" 2>/dev/null)
  email_provider="${mx_result#EMAIL_PROVIDER: }"

  echo "  DNS provider..."
  ns_result=$(discover_ns_provider "$domain" 2>/dev/null)
  dns_provider="${ns_result#DNS_PROVIDER: }"

  # Summary line
  echo "  Results: SEC=$sec_status WHOIS=$whois_status Subs=${sub_count:-0} IP=$primary_ip"
  echo "  Insights: Email=$email_provider DNS=$dns_provider TXT=[$txt_insights]"

  # CSV row
  echo "\"$company\",\"$domain\",\"$vertical\",\"$country\",\"$ticker\",\"$sec_status\",\"$whois_status\",\"$dns_records\",\"$txt_insights\",\"${sub_count:-0}\",\"$primary_ip\",\"$ip_geo\",\"$email_provider\",\"$dns_provider\"" \
    >>"$OUTDIR/summary.csv"

  echo ""
  sleep 0.5 # rate limit courtesy between companies
done

# ── Batch Summary ───────────────────────────────────────────
echo "=== BATCH SUMMARY ==="
echo "Total companies: $TOTAL"
echo "SEC EDGAR found: $SEC_FOUND/$TOTAL"
echo "WHOIS data found: $WHOIS_FOUND/$TOTAL"
echo "High subdomain count (>100): $HIGH_SUBDOMAIN/$TOTAL"
echo ""
echo "CSV report: $OUTDIR/summary.csv"
echo "Per-company data: $OUTDIR/<domain>/"
echo ""

# ── Gap Analysis ────────────────────────────────────────────
echo "=== DISCOVERY GAP ANALYSIS ==="
echo ""
echo "Companies missing SEC data (private or non-US):"
grep 'SEC_STATUS:not_found' "$OUTDIR"/*/sec.txt 2>/dev/null | sed 's|.*/||;s|/sec.txt.*||' | tr '-' '.' || echo "  (none)"
echo ""
echo "Companies with 0 subdomains:"
grep 'SUBDOMAIN_COUNT: 0' "$OUTDIR"/*/subdomains.txt 2>/dev/null | sed 's|.*/||;s|/subdomains.txt.*||' | tr '-' '.' || echo "  (none)"
echo ""
echo "Unique email providers found:"
grep "EMAIL_PROVIDER:" "$OUTDIR"/*/. 2>/dev/null | sed 's/.*EMAIL_PROVIDER: //' | sort | uniq -c | sort -rn || true
echo ""
echo "Unique DNS providers found:"
grep "DNS_PROVIDER:" "$OUTDIR"/*/. 2>/dev/null | sed 's/.*DNS_PROVIDER: //' | sort | uniq -c | sort -rn || true
