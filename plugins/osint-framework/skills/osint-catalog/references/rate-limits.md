# OSINT Rate-Limit Registry

Authoritative rate-limit reference for all OSINT tools and APIs.
The executor agent and investigation pipelines source this file.

---

## 1. Reusable Backoff Helper Function

Wrap all HTTP calls through `osint_curl` to get automatic retry with
exponential backoff on 429/503 responses.

```bash
osint_curl() {
  local url="$1"; shift
  local max_retries=5 delay=1
  for attempt in $(seq 1 $max_retries); do
    local http_code body
    body=$(curl -s -w "\n%{http_code}" --connect-timeout 10 "$@" "$url")
    http_code=$(echo "$body" | tail -1)
    body=$(echo "$body" | sed '$d')
    case "$http_code" in
      200|201) echo "$body"; return 0 ;;
      429|503)
        local retry_after=$(curl -sI "$url" 2>/dev/null | grep -i 'retry-after' | awk '{print $2}' | tr -d '\r')
        local wait=${retry_after:-$delay}
        echo "Rate limited ($http_code). Retry $attempt/$max_retries in ${wait}s..." >&2
        sleep "$wait"
        delay=$((delay * 2))
        ;;
      *) echo "$body"; return 1 ;;
    esac
  done
  echo "Max retries reached for $url" >&2; return 1
}
```

Backoff schedule: 1s, 2s, 4s, 8s, 16s (max 5 retries).
If the server sends a `Retry-After` header, that value is used instead.

---

## 2. Rate Limit Registry -- Web APIs

| API | Endpoint | Free Limit | Signal | Delay | Auth |
|-----|----------|-----------|--------|-------|------|
| ipinfo.io | `ipinfo.io/{ip}/json` | 1,000/day | HTTP 429 | 100ms between calls | Token: unlimited |
| crt.sh | `crt.sh/?q=...&output=json` | ~60/min/IP | HTTP 429 | 1s between calls | No auth option |
| NVD | `services.nvd.nist.gov/rest/json/cves/2.0` | 5 per 30s (no key) | HTTP 429 | 6s between calls | API key: 50/30s |
| HIBP | `haveibeenpwned.com/api/v3` | Passwords only free | HTTP 429 | N/A -- paid for email | Paid subscription |
| VirusTotal | `virustotal.com/api/v3` | 4/min, 500/day | HTTP 429 | 15s between calls | Premium: higher |
| Shodan | `api.shodan.io` | 1/sec | HTTP 429 | 1s between calls | API key required |
| ip-api.com | `ip-api.com/json/{ip}` | 45/min | HTTP 429 + 1hr ban | 1.5s between calls | Pro: 15/sec |
| GitHub API | `api.github.com` | 60/hr (no auth) | HTTP 403 + X-RateLimit headers | 60s between calls | Token: 5,000/hr |

---

## 3. API Key Requirements

Some APIs require authentication. Check for the env var before calling —
if missing, skip gracefully with a message.

| API | Env Var | Free Tier | Skip Message |
|-----|---------|-----------|-------------|
| OpenCorporates | `OPENCORPORATES_API_KEY` | Requires token | "OpenCorporates requires API key (set OPENCORPORATES_API_KEY)" |
| OpenSanctions | `OPENSANCTIONS_API_KEY` | Requires token | "OpenSanctions requires API key (set OPENSANCTIONS_API_KEY)" |
| Shodan | `SHODAN_API_KEY` | Free key available | "Shodan requires API key (set SHODAN_API_KEY)" |
| VirusTotal | `VT_API_KEY` | Free key available | "VirusTotal requires API key (set VT_API_KEY)" |
| HIBP | `HIBP_API_KEY` | Paid for email search | "HIBP email search requires paid key (set HIBP_API_KEY)" |
| NVD | `NVD_API_KEY` | Optional (higher limits) | Works without key at 5/30s; set NVD_API_KEY for 50/30s |
| GitHub | `GH_TOKEN` | Optional (higher limits) | Works without token at 60/hr; uses GH_TOKEN if set |
| AbuseIPDB | `ABUSEIPDB_API_KEY` | Free key available | "AbuseIPDB requires API key (set ABUSEIPDB_API_KEY)" |

### API Key Check Helper

```bash
# Check if an API key is available; skip if not
osint_require_key() {
  local api="$1" var="$2"
  if [ -z "${!var:-}" ]; then
    echo "[skip] $api requires API key (set $var)" >&2
    return 1
  fi
  return 0
}

# Usage:
# osint_require_key "OpenCorporates" "OPENCORPORATES_API_KEY" || { echo "Skipping OpenCorporates"; continue; }
# curl -s "https://api.opencorporates.com/v0.4/companies/search?q=TARGET&api_token=${OPENCORPORATES_API_KEY}"
```

### APIs That Work Without Keys

These APIs are fully free with no authentication:

- **SEC EDGAR** — requires User-Agent header only (no key)
- **ipinfo.io** — 1,000/day without token
- **crt.sh** — no auth, 60/min
- **ip-api.com** — 45/min without key
- **NVD** — 5/30s without key (optional key for higher limits)
- **whois/dig/nslookup** — protocol-based, no auth

---

## 4. Rate Limit Registry -- CLI Tools with Internal Rate Handling

| Tool | Rate Limit Behavior | Built-in Flags | Recommended Config |
|------|-------------------|----------------|-------------------|
| subfinder | Per-provider limits | `-rls` (rate limit per second) | `subfinder -rls 5 -d TARGET` |
| nuclei | Template-based | `-rate-limit N` (req/sec), `-bulk-size`, `-concurrency` | `nuclei -rate-limit 10 -u TARGET` |
| httpx | Target-side throttling | `-rl N` (rate limit), `-threads N` | `httpx -rl 50 -threads 10` |
| sherlock | Per-platform limits | `--timeout N` | `sherlock --timeout 10 TARGET` |
| maigret | Per-site limits | `--timeout N` | `maigret --timeout 10 TARGET` |
| holehe | Per-service limits | None -- handles internally | Check "rateLimit" in output |
| yt-dlp | YouTube anti-scrape | `--sleep-interval N` | `yt-dlp --sleep-interval 3` |

---

## 4. No Rate Limit (Local/System Tools)

The following tools run locally or use protocols with extremely high
server-side limits. They are safe for unlimited use:

- **searchsploit** -- local exploit-db mirror
- **exiftool** -- local metadata extraction
- **jq** -- local JSON processing
- **grep** -- local text search
- **awk** -- local text processing
- **sed** -- local stream editing
- **whois** -- DNS protocol (server limits in the thousands/sec, not practically limiting)
- **dig** -- DNS protocol (same as whois)
- **nslookup** -- DNS protocol (same as whois)
- **nmap** -- raw sockets, self-throttled via `--max-rate`
- **masscan** -- raw sockets, self-throttled via `--rate`
- **tshark** -- passive packet capture
- **gitleaks** -- local secret scanning
- **gobuster** -- self-throttled via `-t` threads flag

> **Note:** whois, dig, and nslookup use DNS/WHOIS protocols which have
> server-side limits, but these are extremely high (thousands/sec) and not
> practically limiting for OSINT workflows.

---

## 5. Rate-Aware curl Patterns

Copy-paste patterns for each major API. All use `osint_curl` from Section 1.

```bash
# ipinfo.io (1,000/day -- use sparingly)
osint_curl "https://ipinfo.io/${IP}/json" | jq '{ip,city,country,org}'

# NVD (5 per 30s -- add 6s delay between calls, or use API key)
osint_curl "https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${QUERY}&resultsPerPage=5"
sleep 6  # respect 5-per-30s limit

# crt.sh (60/min -- add 1s delay)
osint_curl "https://crt.sh/?q=${DOMAIN}&output=json" | jq -r '.[].common_name'
sleep 1

# GitHub API (60/hr unauth -- cache aggressively)
osint_curl "https://api.github.com/users/${USERNAME}" -H "Accept: application/vnd.github+json"

# VirusTotal (4/min -- add 15s delay)
osint_curl "https://www.virustotal.com/api/v3/domains/${DOMAIN}" \
  -H "x-apikey: ${VT_API_KEY}"
sleep 15

# Shodan (1/sec -- add 1s delay)
osint_curl "https://api.shodan.io/shodan/host/${IP}?key=${SHODAN_KEY}"
sleep 1

# ip-api.com (45/min -- add 1.5s delay, avoid ban)
osint_curl "http://ip-api.com/json/${IP}"
sleep 1.5
```

---

## 6. Caching Strategy

Cache API responses locally to avoid redundant calls and stay within rate
limits. All cached files use the pattern:

```
/tmp/osint-cache-{api}-{target-hash}.json
```

### Cache Helper Functions

```bash
osint_cache_get() {
  local cache_file="/tmp/osint-cache-${1}-$(echo -n "$2" | md5sum | cut -d' ' -f1).json"
  local ttl="${3:-3600}"
  if [ -f "$cache_file" ]; then
    local age=$(( $(date +%s) - $(stat -c %Y "$cache_file") ))
    if [ "$age" -lt "$ttl" ]; then
      cat "$cache_file"; return 0
    fi
  fi
  return 1
}

osint_cache_set() {
  local cache_file="/tmp/osint-cache-${1}-$(echo -n "$2" | md5sum | cut -d' ' -f1).json"
  cat > "$cache_file"
}
```

### Usage Example

```bash
# Check cache first, fetch only if stale/missing
result=$(osint_cache_get "ipinfo" "$IP" 3600) || {
  result=$(osint_curl "https://ipinfo.io/${IP}/json")
  echo "$result" | osint_cache_set "ipinfo" "$IP"
}
echo "$result" | jq '{ip,city,country,org}'
```

### Cache TTL Guidelines

| Data Type | Recommended TTL | Rationale |
|-----------|----------------|-----------|
| IP geolocation | 1 hour (3600s) | Geo data changes infrequently |
| DNS/certificates | 1 hour (3600s) | Cert issuance is slow |
| CVE/vulnerability | 6 hours (21600s) | NVD updates on a schedule |
| GitHub profiles | 30 minutes (1800s) | Profile data changes moderately |
| VirusTotal scans | 1 hour (3600s) | Re-scans are expensive |
| Shodan host data | 1 hour (3600s) | Scan data refreshes slowly |
