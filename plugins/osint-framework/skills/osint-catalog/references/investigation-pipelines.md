# OSINT Investigation Pipelines

> Copy-paste-ready shell pipelines for 5 common investigation types.
> All commands use **safe defaults** — no aggressive scanning, no auth bypass.
> Placeholders: `TARGET`, `example.com`, `user@example.com`, `johndoe`

---

## Rate Limiting

All API calls in these pipelines should use rate-aware patterns.
See `skills/osint-catalog/references/rate-limits.md` for the full registry.

### Helper Functions

Source these before running any pipeline:

```bash
# Rate-aware curl with exponential backoff on 429/503
osint_curl() {
  local url="$1"; shift
  local retries=0 max_retries=4 delay=1
  while [ "$retries" -lt "$max_retries" ]; do
    local response http_code
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}" --connect-timeout 10 "$@" "$url" 2>/dev/null)
    http_code=$(echo "$response" | grep "HTTP_CODE:" | sed 's/HTTP_CODE://')
    response=$(echo "$response" | grep -v "HTTP_CODE:")
    case "$http_code" in
      200|201) echo "$response"; return 0 ;;
      429|503)
        retries=$((retries + 1))
        echo "[rate-limit] $url returned $http_code, retry $retries/$max_retries in ${delay}s" >&2
        sleep "$delay"
        delay=$((delay * 2))
        ;;
      *) echo "$response"; return 0 ;;
    esac
  done
  echo "[rate-limit] $url: max retries exceeded" >&2
  return 1
}

# Cache API responses (default 1-hour TTL)
osint_cache_get() {
  local api="$1" key="$2" ttl="${3:-3600}"
  local cache="/tmp/osint-cache-${api}-$(echo -n "$key" | md5sum | cut -d' ' -f1).json"
  if [ -f "$cache" ]; then
    local age=$(( $(date +%s) - $(stat -c %Y "$cache") ))
    if [ "$age" -lt "$ttl" ]; then cat "$cache"; return 0; fi
  fi
  return 1
}
```

### Key Rate Limits

| API | Limit | Delay |
| ----- | ------- | ------: |
| ipinfo.io | 1,000/day | 100ms |
| crt.sh | 60/min | 1s |
| NVD | 5/30s | 6s |
| GitHub | 60/hr (no auth) | 60s |

---

## 1. Username Investigation Pipeline

**Target:** a username or handle (e.g., `johndoe`)
**Goal:** discover linked accounts, emails, bios, and pivot points
**Estimated time:** 2-8 minutes depending on tool availability

### Pre-flight

```bash
set -eo pipefail
USERNAME="johndoe"
OUTDIR="./osint-results/username-${USERNAME}"
mkdir -p "${OUTDIR}"

# Check available tools
for tool in sherlock maigret curl jq grep awk; do
  if command -v "$tool" &>/dev/null; then
    echo "[OK]   $tool $(command -v "$tool")"
  else
    echo "[MISS] $tool — install with: pip install ${tool}-project 2>/dev/null || pip install $tool"
  fi
done
```

### Full Pipeline

```bash
set -eo pipefail
USERNAME="johndoe"
OUTDIR="./osint-results/username-${USERNAME}"
mkdir -p "${OUTDIR}"

# ── Step 1: Sherlock — multi-platform username search ──────────────
# OPSEC: PASSIVE (makes HTTP requests to public profile URLs)
# Time: ~60-120s
if command -v sherlock &>/dev/null; then
  echo "[1/4] Running sherlock..."
  sherlock "${USERNAME}" \
    --output "${OUTDIR}/sherlock-results.txt" \
    --json "${OUTDIR}/sherlock-results.json" \
    --timeout 10 \
    2>/dev/null

  # Parse JSON output — extract found URLs
  jq -r 'to_entries[]
    | select(.value.status == "Claimed")
    | "\(.key)\t\(.value.url_user)"' \
    "${OUTDIR}/sherlock-results.json" \
    > "${OUTDIR}/sherlock-found-urls.tsv"

  FOUND_COUNT=$(wc -l < "${OUTDIR}/sherlock-found-urls.tsv")
  echo "    Sherlock found ${FOUND_COUNT} accounts"
else
  echo "[1/4] Sherlock not installed — skipping (pip install sherlock-project)"
fi

# ── Step 2: Maigret — extended username enumeration ────────────────
# OPSEC: PASSIVE (HTTP requests to public profile URLs)
# Time: ~120-300s
if command -v maigret &>/dev/null; then
  echo "[2/4] Running maigret..."
  maigret "${USERNAME}" \
    --csv "${OUTDIR}/maigret-results.csv" \
    --json ndjson \
    --fo "${OUTDIR}/maigret-results.json" \
    --timeout 10 \
    --no-color \
    2>/dev/null

  # Parse CSV — extract site name and URL for claimed accounts
  awk -F',' 'NR>1 && $3=="Claimed" {print $1"\t"$2}' \
    "${OUTDIR}/maigret-results.csv" \
    > "${OUTDIR}/maigret-found-urls.tsv" 2>/dev/null || true

  echo "    Maigret results saved"
else
  echo "[2/4] Maigret not installed — skipping (pip install maigret)"
fi

# ── Step 3: Fallback — manual profile URL checks via curl ──────────
# OPSEC: PASSIVE (HTTP HEAD requests to public URLs)
# Time: ~10-30s
echo "[3/4] Running curl-based profile checks..."
PLATFORMS=(
  "GitHub|https://github.com/${USERNAME}"
  "GitLab|https://gitlab.com/${USERNAME}"
  "Twitter/X|https://x.com/${USERNAME}"
  "Reddit|https://www.reddit.com/user/${USERNAME}"
  "Instagram|https://www.instagram.com/${USERNAME}/"
  "LinkedIn|https://www.linkedin.com/in/${USERNAME}/"
  "Medium|https://medium.com/@${USERNAME}"
  "Dev.to|https://dev.to/${USERNAME}"
  "Keybase|https://keybase.io/${USERNAME}"
  "HackerOne|https://hackerone.com/${USERNAME}"
  "Mastodon.social|https://mastodon.social/@${USERNAME}"
  "Pinterest|https://www.pinterest.com/${USERNAME}/"
  "Flickr|https://www.flickr.com/people/${USERNAME}/"
  "SoundCloud|https://soundcloud.com/${USERNAME}"
  "Steam|https://steamcommunity.com/id/${USERNAME}"
  "Twitch|https://www.twitch.tv/${USERNAME}"
  "YouTube|https://www.youtube.com/@${USERNAME}"
  "TikTok|https://www.tiktok.com/@${USERNAME}"
  "Telegram|https://t.me/${USERNAME}"
  "Docker Hub|https://hub.docker.com/u/${USERNAME}"
  "npm|https://www.npmjs.com/~${USERNAME}"
  "PyPI|https://pypi.org/user/${USERNAME}/"
  "HackerNews|https://news.ycombinator.com/user?id=${USERNAME}"
  "Gravatar|https://en.gravatar.com/${USERNAME}.json"
)

> "${OUTDIR}/curl-found-urls.tsv"
for entry in "${PLATFORMS[@]}"; do
  PLATFORM="${entry%%|*}"
  URL="${entry##*|}"
  HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" \
    -L --max-time 8 --max-redirs 3 \
    -A "Mozilla/5.0" "${URL}" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" =~ ^(200|301|302)$ ]]; then
    echo "${PLATFORM}\t${URL}\t${HTTP_CODE}" >> "${OUTDIR}/curl-found-urls.tsv"
  fi
done

CURL_FOUND=$(wc -l < "${OUTDIR}/curl-found-urls.tsv")
echo "    Curl checks found ${CURL_FOUND} potential profiles"

# ── Step 4: Extract emails and bios from found profiles ────────────
# OPSEC: PASSIVE (scraping public profile pages)
# Time: ~10-30s (#2)
echo "[4/4] Extracting emails from found profiles..."
> "${OUTDIR}/extracted-emails.txt"

# Combine all found URLs
cat "${OUTDIR}"/*-found-urls.tsv 2>/dev/null \
  | awk -F'\t' '{print $2}' \
  | sort -u \
  | while read -r URL; do
    [ -z "$URL" ] && continue
    curl -sL --max-time 8 -A "Mozilla/5.0" "$URL" 2>/dev/null \
      | grep -oEi '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' \
      >> "${OUTDIR}/extracted-emails.txt" 2>/dev/null || true
  done

sort -u -o "${OUTDIR}/extracted-emails.txt" "${OUTDIR}/extracted-emails.txt"
EMAIL_COUNT=$(wc -l < "${OUTDIR}/extracted-emails.txt")
echo "    Extracted ${EMAIL_COUNT} unique email(s)"

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo "=== Username Investigation Complete: ${USERNAME} ==="
echo "Results directory: ${OUTDIR}"
ls -la "${OUTDIR}/"
```

### Quick One-Liner

```bash
# Sherlock only — fast account discovery
USERNAME="johndoe" && sherlock "$USERNAME" --json /dev/stdout 2>/dev/null | jq -r 'to_entries[] | select(.value.status=="Claimed") | .value.url_user'

# Curl only — no pip dependencies required
USERNAME="johndoe" && for site in github.com gitlab.com x.com reddit.com/user instagram.com medium.com/@; do URL="https://${site}/${USERNAME}"; code=$(curl -o/dev/null -s -w"%{http_code}" -L --max-time 5 "$URL"); [ "$code" = "200" ] && echo "$URL"; done
```

---

## 2. Email Investigation Pipeline

**Target:** an email address (e.g., `user@example.com`)
**Goal:** discover linked accounts, breach data, domain info, and pivot to username/domain recon
**Estimated time:** 3-10 minutes

### Pre-flight (2. Email Investigation Pipeline)

```bash
set -eo pipefail
EMAIL="user@example.com"
OUTDIR="./osint-results/email-${EMAIL//[@.]/-}"
mkdir -p "${OUTDIR}"

for tool in holehe h8mail curl jq grep whois dig; do
  if command -v "$tool" &>/dev/null; then
    echo "[OK]   $tool"
  else
    echo "[MISS] $tool"
  fi
done
```

### Full Pipeline (2. Email Investigation Pipeline)

```bash
set -eo pipefail
EMAIL="user@example.com"
OUTDIR="./osint-results/email-${EMAIL//[@.]/-}"
mkdir -p "${OUTDIR}"

# Derive components
USERNAME="${EMAIL%%@*}"
DOMAIN="${EMAIL##*@}"
echo "Email: ${EMAIL}"
echo "Username portion: ${USERNAME}"
echo "Domain portion: ${DOMAIN}"
echo ""

# ── Step 1: Holehe — check email registration on services ──────────
# OPSEC: ACTIVE (sends login/registration requests to services)
# Time: ~60-180s
if command -v holehe &>/dev/null; then
  echo "[1/5] Running holehe..."
  holehe "${EMAIL}" \
    --only-used \
    --no-color \
    2>/dev/null \
    | tee "${OUTDIR}/holehe-output.txt"

  # Parse: extract service names where email is registered
  grep -E '^\[' "${OUTDIR}/holehe-output.txt" \
    | grep -i "used" \
    | awk '{print $2}' \
    > "${OUTDIR}/holehe-registered-services.txt" 2>/dev/null || true

  echo "    $(wc -l < "${OUTDIR}/holehe-registered-services.txt") services found"
else
  echo "[1/5] Holehe not installed — skipping (pip install holehe)"
fi

# ── Step 2: H8mail — breach/paste lookup ───────────────────────────
# OPSEC: PASSIVE (queries public breach databases)
# Time: ~10-30s (#3)
if command -v h8mail &>/dev/null; then
  echo "[2/5] Running h8mail..."
  h8mail -t "${EMAIL}" \
    -o "${OUTDIR}/h8mail-results.json" \
    --json \
    2>/dev/null || true

  # Parse breach results
  if [ -f "${OUTDIR}/h8mail-results.json" ]; then
    jq -r '.targets[]? | .data[]? | "\(.source // "unknown")\t\(.data // "N/A")"' \
      "${OUTDIR}/h8mail-results.json" \
      > "${OUTDIR}/h8mail-breaches.tsv" 2>/dev/null || true
    echo "    $(wc -l < "${OUTDIR}/h8mail-breaches.tsv") breach entries found"
  fi
else
  echo "[2/5] H8mail not installed — skipping (pip install h8mail)"
fi

# ── Step 3: Fallback breach check — Have I Been Pwned API pattern ──
# OPSEC: PASSIVE (queries public API)
# Time: ~3s
# NOTE: HIBP v3 requires an API key ($3.50/month). This shows the pattern.
echo "[3/5] Checking breach databases via API..."

# HIBP API (requires key — shown as pattern)
# Uncomment and set HIBP_API_KEY to use:
# HIBP_API_KEY="your-api-key-here"
# curl -s -H "hibp-api-key: ${HIBP_API_KEY}" \
#   -H "user-agent: OSINT-Pipeline" \
#   "https://haveibeenpwned.com/api/v3/breachedaccount/${EMAIL}?truncateResponse=false" \
#   | jq '.' > "${OUTDIR}/hibp-breaches.json"

# Free alternative: check via emailrep.io (no key needed for basic lookups)
curl -s -A "OSINT-Pipeline" \
  "https://emailrep.io/${EMAIL}" \
  2>/dev/null \
  | jq '.' \
  > "${OUTDIR}/emailrep-results.json" 2>/dev/null || echo '{}' > "${OUTDIR}/emailrep-results.json"

# Parse reputation data
if [ -s "${OUTDIR}/emailrep-results.json" ]; then
  jq -r '
    "Reputation: \(.reputation // "unknown")",
    "Suspicious: \(.suspicious // "unknown")",
    "Profiles: \(.details.profiles // [] | join(", "))",
    "Breached: \(.details.data_breach // "unknown")",
    "Malicious Activity: \(.details.malicious_activity // "unknown")"
  ' "${OUTDIR}/emailrep-results.json" 2>/dev/null \
    | tee "${OUTDIR}/emailrep-summary.txt"
fi

# ── Step 4: Gravatar / profile lookup ──────────────────────────────
# OPSEC: PASSIVE (public API query)
# Time: ~3s (#2)
echo ""
echo "[4/5] Checking Gravatar and public profiles..."

# Gravatar hash lookup
EMAIL_HASH=$(echo -n "${EMAIL}" | tr '[:upper:]' '[:lower:]' | md5sum | awk '{print $1}')
curl -s "https://en.gravatar.com/${EMAIL_HASH}.json" 2>/dev/null \
  | jq '.' \
  > "${OUTDIR}/gravatar-profile.json" 2>/dev/null || echo '{}' > "${OUTDIR}/gravatar-profile.json"

if jq -e '.entry' "${OUTDIR}/gravatar-profile.json" &>/dev/null; then
  echo "    Gravatar profile found:"
  jq -r '.entry[0] | "    Name: \(.displayName // "N/A")", "    Location: \(.currentLocation // "N/A")", "    About: \(.aboutMe // "N/A")", "    URLs: \([.urls[]?.value] | join(", "))"' \
    "${OUTDIR}/gravatar-profile.json" 2>/dev/null || true
else
  echo "    No Gravatar profile found"
fi

# ── Step 5: Domain investigation pivot ─────────────────────────────
# OPSEC: PASSIVE (DNS and WHOIS queries)
# Time: ~10s
echo ""
echo "[5/5] Pivoting to domain investigation for ${DOMAIN}..."

# Quick domain info
whois "${DOMAIN}" 2>/dev/null \
| grep -iE '(registrant | admin | tech | name server | creation | expir |
  > "${OUTDIR}/domain-whois-summary.txt" 2>/dev/null || true

dig "${DOMAIN}" ANY +short 2>/dev/null \
  > "${OUTDIR}/domain-dns-quick.txt" 2>/dev/null || true

# MX records (may reveal email provider)
dig "${DOMAIN}" MX +short 2>/dev/null \
  | tee "${OUTDIR}/domain-mx-records.txt"

echo ""
echo "    Email provider indicators:"
grep -qi "google\|gmail" "${OUTDIR}/domain-mx-records.txt" 2>/dev/null && echo "    -> Google Workspace" || true
grep -qi "outlook\|microsoft" "${OUTDIR}/domain-mx-records.txt" 2>/dev/null && echo "    -> Microsoft 365" || true
grep -qi "proton" "${OUTDIR}/domain-mx-records.txt" 2>/dev/null && echo "    -> ProtonMail" || true
grep -qi "zoho" "${OUTDIR}/domain-mx-records.txt" 2>/dev/null && echo "    -> Zoho Mail" || true

# ── Summary ──────────────────────────────────────────────────────── (#2)
echo ""
echo "=== Email Investigation Complete: ${EMAIL} ==="
echo "Username pivot: ${USERNAME}"
echo "Domain pivot: ${DOMAIN}"
echo "Results directory: ${OUTDIR}"
ls -la "${OUTDIR}/"
```

### Quick One-Liner (── Summary ────────────────────────────────────────────────────────)

```bash
# Fast email overview — emailrep + gravatar + MX in one shot
EMAIL="user@example.com" \
  && echo "--- emailrep ---" \
  && curl -s "https://emailrep.io/${EMAIL}" \
    | jq '{reputation,suspicious,profiles:.details.profiles}' 2>/dev/null \
  && echo "--- gravatar ---" \
  && curl -s "https://en.gravatar.com/$(echo -n "$EMAIL" \
    | tr '[:upper:]' '[:lower:]' | md5sum | awk '{print $1}').json" \
    | jq '.entry[0].displayName // "none"' 2>/dev/null \
  && echo "--- MX ---" \
  && dig "${EMAIL##*@}" MX +short
```

---

## 3. Domain Investigation Pipeline

**Target:** a domain name (e.g., `example.com`)
**Goal:** full domain profile — registration, DNS, subdomains, live hosts, technologies, vulnerabilities
**Estimated time:** 5-20 minutes

### Pre-flight (3. Domain Investigation Pipeline)

```bash
set -eo pipefail
DOMAIN="example.com"
OUTDIR="./osint-results/domain-${DOMAIN}"
mkdir -p "${OUTDIR}"

for tool in whois dig nslookup subfinder amass httpx nuclei curl jq gobuster ffuf; do
  if command -v "$tool" &>/dev/null; then
    echo "[OK]   $tool"
  else
    echo "[MISS] $tool"
  fi
done
```

### Full Pipeline (3. Domain Investigation Pipeline)

```bash
set -eo pipefail
DOMAIN="example.com"
OUTDIR="./osint-results/domain-${DOMAIN}"
mkdir -p "${OUTDIR}"

# ── Step 1: WHOIS — registration data ─────────────────────────────
# OPSEC: PASSIVE (public WHOIS query)
# Time: ~3-5s
echo "[1/6] Running WHOIS lookup..."
whois "${DOMAIN}" > "${OUTDIR}/whois-full.txt" 2>/dev/null || true

# Parse key fields
grep -iE '^(domain name|registra|admin|tech|name server|creation|expir|updated|dnssec|status)' \
  "${OUTDIR}/whois-full.txt" \
  | sort -u \
  > "${OUTDIR}/whois-summary.txt" 2>/dev/null || true

# Extract registrar and dates
echo "  Registrar: $(grep -im1 'registrantar:' "${OUTDIR}/whois-full.txt" | awk -F': ' '{print $2}' | xargs)"
echo "  Created:   $(grep -im1 'creation' "${OUTDIR}/whois-full.txt" | awk -F': ' '{print $2}' | xargs)"
echo "  Expires:   $(grep -im1 'expir' "${OUTDIR}/whois-full.txt" | awk -F': ' '{print $2}' | xargs)"
echo "  Name Servers:"
grep -i 'name server' "${OUTDIR}/whois-full.txt" | awk -F': ' '{print "    " $2}' | sort -u

# ── Step 2: DNS — all record types ────────────────────────────────
# OPSEC: PASSIVE (standard DNS queries)
# Time: ~5-10s
echo ""
echo "[2/6] Running DNS enumeration..."

for RTYPE in A AAAA MX TXT NS SOA CNAME CAA SRV PTR; do
  echo "  --- ${RTYPE} records ---"
  dig "${DOMAIN}" "${RTYPE}" +short 2>/dev/null \
    | tee -a "${OUTDIR}/dns-${RTYPE}.txt"
done

# Combined DNS summary
{
  echo "=== DNS Summary for ${DOMAIN} ==="
  echo ""
  for RTYPE in A AAAA MX TXT NS SOA CNAME CAA; do
    if [ -s "${OUTDIR}/dns-${RTYPE}.txt" ]; then
      echo "--- ${RTYPE} ---"
      cat "${OUTDIR}/dns-${RTYPE}.txt"
      echo ""
    fi
  done
} > "${OUTDIR}/dns-summary.txt"

# SPF, DMARC, DKIM checks
echo "  --- SPF ---"
dig "${DOMAIN}" TXT +short 2>/dev/null | grep -i 'spf' || echo "  (none)"
echo "  --- DMARC ---"
dig "_dmarc.${DOMAIN}" TXT +short 2>/dev/null || echo "  (none)"
echo "  --- DKIM (default selector) ---"
dig "default._domainkey.${DOMAIN}" TXT +short 2>/dev/null || echo "  (none)"

# ── Step 3: Subdomain enumeration ─────────────────────────────────
# OPSEC: PASSIVE (subfinder uses public sources; amass passive mode)
# Time: ~30-120s
echo ""
echo "[3/6] Enumerating subdomains..."
> "${OUTDIR}/subdomains-all.txt"

if command -v subfinder &>/dev/null; then
  echo "  Running subfinder..."
  subfinder -d "${DOMAIN}" \
    -silent -rls 5 \
    -o "${OUTDIR}/subdomains-subfinder.txt" \
    -json -oJ "${OUTDIR}/subdomains-subfinder.json" \
    2>/dev/null || true
  cat "${OUTDIR}/subdomains-subfinder.txt" >> "${OUTDIR}/subdomains-all.txt" 2>/dev/null || true
  echo "    subfinder found $(wc -l < "${OUTDIR}/subdomains-subfinder.txt" 2>/dev/null || echo 0) subdomains"
else
  echo "  subfinder not installed — skipping"
fi

if command -v amass &>/dev/null; then
  echo "  Running amass (passive mode)..."
  timeout 120 amass enum -passive -d "${DOMAIN}" \
    -o "${OUTDIR}/subdomains-amass.txt" \
    2>/dev/null || true
  cat "${OUTDIR}/subdomains-amass.txt" >> "${OUTDIR}/subdomains-all.txt" 2>/dev/null || true
  echo "    amass found $(wc -l < "${OUTDIR}/subdomains-amass.txt" 2>/dev/null || echo 0) subdomains"
else
  echo "  amass not installed — skipping"
fi

# Fallback: crt.sh certificate transparency
echo "  Checking crt.sh certificate transparency..."
curl -s "https://crt.sh/?q=%25.${DOMAIN}&output=json" 2>/dev/null \
  | jq -r '.[].name_value' 2>/dev/null \
  | sed 's/\*\.//g' \
  | sort -u \
  > "${OUTDIR}/subdomains-crtsh.txt" 2>/dev/null || true
cat "${OUTDIR}/subdomains-crtsh.txt" >> "${OUTDIR}/subdomains-all.txt" 2>/dev/null || true
echo "    crt.sh found $(wc -l < "${OUTDIR}/subdomains-crtsh.txt" 2>/dev/null || echo 0) entries"
sleep 1  # crt.sh: 60/min rate limit

# Deduplicate
sort -u -o "${OUTDIR}/subdomains-all.txt" "${OUTDIR}/subdomains-all.txt"
TOTAL_SUBS=$(wc -l < "${OUTDIR}/subdomains-all.txt")
echo "  Total unique subdomains: ${TOTAL_SUBS}"

# ── Step 4: Probe live subdomains ──────────────────────────────────
# OPSEC: ACTIVE (HTTP requests to discovered subdomains)
# Time: ~30-120s depending on subdomain count
echo ""
echo "[4/6] Probing live subdomains..."

if command -v httpx &>/dev/null; then
  httpx -l "${OUTDIR}/subdomains-all.txt" \
    -silent \
    -status-code \
    -title \
    -tech-detect \
    -content-length \
    -json \
    -o "${OUTDIR}/httpx-results.json" \
    2>/dev/null || true

  # Parse: live hosts with status codes and titles
  jq -r '"\(.status_code)\t\(.url)\t\(.title // "N/A")\t\(.tech // [] | join(","))"' \
    "${OUTDIR}/httpx-results.json" 2>/dev/null \
    | sort -t$'\t' -k1 -n \
    > "${OUTDIR}/httpx-live-hosts.tsv" 2>/dev/null || true

  # Extract just the live URLs for nuclei input
  jq -r '.url' "${OUTDIR}/httpx-results.json" 2>/dev/null \
    > "${OUTDIR}/live-urls.txt" 2>/dev/null || true

  echo "  $(wc -l < "${OUTDIR}/httpx-live-hosts.tsv" 2>/dev/null || echo 0) live hosts found"
else
  echo "  httpx not installed — falling back to curl probing..."
  > "${OUTDIR}/live-urls.txt"
  while read -r sub; do
    CODE=$(curl -o/dev/null -s -w "%{http_code}" --max-time 5 "https://${sub}" 2>/dev/null || echo "000")
    if [ "$CODE" != "000" ]; then
      echo "${CODE}\thttps://${sub}" >> "${OUTDIR}/httpx-live-hosts.tsv"
      echo "https://${sub}" >> "${OUTDIR}/live-urls.txt"
    fi
  done < "${OUTDIR}/subdomains-all.txt"
  echo "  $(wc -l < "${OUTDIR}/live-urls.txt" 2>/dev/null || echo 0) live hosts found"
fi

# ── Step 5: Vulnerability scanning ────────────────────────────────
# OPSEC: ACTIVE (sends HTTP probes with detection payloads)
# Time: ~60-300s
echo ""
echo "[5/6] Running vulnerability scan..."

if command -v nuclei &>/dev/null && [ -s "${OUTDIR}/live-urls.txt" ]; then
  nuclei -l "${OUTDIR}/live-urls.txt" \
    -severity low,medium,high,critical \
    -silent -rate-limit 10 \
    -json \
    -o "${OUTDIR}/nuclei-results.json" \
    2>/dev/null || true

  # Parse: group by severity
  if [ -s "${OUTDIR}/nuclei-results.json" ]; then
    echo "  Vulnerabilities by severity:"
    for SEV in critical high medium low info; do
      COUNT=$(grep -c "\"${SEV}\"" "${OUTDIR}/nuclei-results.json" 2>/dev/null || echo "0")
      [ "$COUNT" -gt 0 ] && echo "    ${SEV}: ${COUNT}"
    done

    # Extract details
    jq -r '"\(.info.severity)\t\(.info.name)\t\(.host)\t\(.matched_at // "N/A")"' \
      "${OUTDIR}/nuclei-results.json" 2>/dev/null \
      | sort \
      > "${OUTDIR}/nuclei-findings.tsv" 2>/dev/null || true
  else
    echo "  No vulnerabilities found"
  fi
else
  echo "  nuclei not installed or no live URLs — skipping"
fi

# ── Step 6: Technology detection via headers ───────────────────────
# OPSEC: PASSIVE (reads HTTP response headers only)
# Time: ~5-15s
echo ""
echo "[6/6] Detecting technologies via HTTP headers..."

{
  echo "=== Technology Detection for ${DOMAIN} ==="
  echo ""
  MAIN_URL="https://${DOMAIN}"

  HEADERS=$(curl -sI -L --max-time 10 -A "Mozilla/5.0" "${MAIN_URL}" 2>/dev/null)
  echo "${HEADERS}" > "${OUTDIR}/response-headers.txt"

  echo "Server: $(echo "${HEADERS}" | grep -i '^server:' | head -1 | awk -F': ' '{print $2}' | tr -d '\r')"
  echo "X-Powered-By: $(echo "${HEADERS}" | grep -i '^x-powered-by:' | head -1 | awk -F': ' '{print $2}' | tr -d '\r')"
  echo "X-Generator: $(echo "${HEADERS}" | grep -i '^x-generator:' | head -1 | awk -F': ' '{print $2}' | tr -d '\r')"
  echo "Via: $(echo "${HEADERS}" | grep -i '^via:' | head -1 | awk -F': ' '{print $2}' | tr -d '\r')"

  # CDN / WAF detection from headers
  echo ""
  echo "CDN/WAF indicators:"
  echo "${HEADERS}" | grep -qi 'cloudflare' && echo "  -> Cloudflare detected"
  echo "${HEADERS}" | grep -qi 'akamai' && echo "  -> Akamai detected"
  echo "${HEADERS}" | grep -qi 'fastly' && echo "  -> Fastly detected"
  echo "${HEADERS}" | grep -qi 'x-amz\|amazons3\|cloudfront' && echo "  -> AWS detected"
  echo "${HEADERS}" | grep -qi 'x-azure\|azure' && echo "  -> Azure detected"
  echo "${HEADERS}" | grep -qi 'x-goog\|gfe\|google' && echo "  -> Google Cloud detected"
  echo "${HEADERS}" | grep -qi 'varnish' && echo "  -> Varnish cache detected"
  echo "${HEADERS}" | grep -qi 'nginx' && echo "  -> Nginx detected"

  # Security headers check
  echo ""
  echo "Security headers:"
  for HDR in "strict-transport-security" "content-security-policy" "x-frame-options" \
    "x-content-type-options" "x-xss-protection" "referrer-policy" \
    "permissions-policy" "cross-origin-opener-policy"; do
    if echo "${HEADERS}" | grep -qi "^${HDR}:"; then
      echo "  [SET]   ${HDR}"
    else
      echo "  [MISS]  ${HDR}"
    fi
  done
} | tee "${OUTDIR}/tech-detection.txt"

# ── Summary ──────────────────────────────────────────────────────── (#3)
echo ""
echo "=== Domain Investigation Complete: ${DOMAIN} ==="
echo "Results directory: ${OUTDIR}"
ls -la "${OUTDIR}/"
```

### Quick One-Liner (── Summary ────────────────────────────────────────────────────────) #2

```bash
# Fast domain overview — WHOIS + DNS + crt.sh subdomains
DOMAIN="example.com" && echo "--- WHOIS ---" && whois "$DOMAIN" 2>/dev/null | grep -iE '(registra|creat|expir|name server)' | head -10 && echo "--- DNS ---" && for r in A MX NS TXT; do echo "[$r]"; dig "$DOMAIN" "$r" +short; done && echo "--- Subdomains (crt.sh) ---" && curl -s "https://crt.sh/?q=%25.${DOMAIN}&output=json" | jq -r '.[].name_value' 2>/dev/null | sed 's/\*\.//g' | sort -u | head -20
```

---

## 4. IP Address Investigation Pipeline

**Target:** an IP address (e.g., `198.51.100.1`)
**Goal:** geolocation, ownership, open ports, running services, reputation
**Estimated time:** 3-15 minutes

### Pre-flight (4. IP Address Investigation Pipeline)

```bash
set -eo pipefail
IP="198.51.100.1"
OUTDIR="./osint-results/ip-${IP//./-}"
mkdir -p "${OUTDIR}"

for tool in whois dig nmap masscan curl jq searchsploit; do
  if command -v "$tool" &>/dev/null; then
    echo "[OK]   $tool"
  else
    echo "[MISS] $tool"
  fi
done
```

### Full Pipeline (4. IP Address Investigation Pipeline)

```bash
set -eo pipefail
IP="198.51.100.1"
OUTDIR="./osint-results/ip-${IP//./-}"
mkdir -p "${OUTDIR}"

# ── Step 1: WHOIS — IP ownership ──────────────────────────────────
# OPSEC: PASSIVE (public WHOIS query) (#2)
# Time: ~3-5s (#2)
echo "[1/6] Running WHOIS lookup..."
whois "${IP}" > "${OUTDIR}/whois-full.txt" 2>/dev/null || true

# Parse key fields (#2)
grep -iE '(netname|orgname|org-name|descr|country|cidr|netrange|abuse|admin-c|tech-c|route|origin)' \
  "${OUTDIR}/whois-full.txt" \
  | head -30 \
  > "${OUTDIR}/whois-summary.txt" 2>/dev/null || true

echo "  $(grep -im1 'orgname\|org-name\|descr' "${OUTDIR}/whois-summary.txt" | head -1)"
echo "  $(grep -im1 'country' "${OUTDIR}/whois-summary.txt" | head -1)"
echo "  $(grep -im1 'netrange\|cidr\|route' "${OUTDIR}/whois-summary.txt" | head -1)"

# ── Step 2: Geolocation & metadata via public APIs ────────────────
# OPSEC: PASSIVE (public API queries)
# Time: ~5s
echo ""
echo "[2/6] Querying geolocation APIs..."

# ipinfo.io (free tier: 50k/month)
curl -s "https://ipinfo.io/${IP}/json" 2>/dev/null \
  | jq '.' \
  > "${OUTDIR}/ipinfo.json" 2>/dev/null || echo '{}' > "${OUTDIR}/ipinfo.json"

if [ -s "${OUTDIR}/ipinfo.json" ]; then
  jq -r '
    "  City: \(.city // "N/A")",
    "  Region: \(.region // "N/A")",
    "  Country: \(.country // "N/A")",
    "  Org: \(.org // "N/A")",
    "  ASN: \(.org // "N/A" | split(" ")[0])",
    "  Hostname: \(.hostname // "N/A")",
    "  Timezone: \(.timezone // "N/A")",
    "  Postal: \(.postal // "N/A")",
    "  Loc: \(.loc // "N/A")"
  ' "${OUTDIR}/ipinfo.json" 2>/dev/null || true
fi

# ip-api.com (free, no key needed, 45 req/min)
curl -s "http://ip-api.com/json/${IP}?fields=66846719" 2>/dev/null \
  | jq '.' \
  > "${OUTDIR}/ip-api.json" 2>/dev/null || true

# ── Step 3: Reverse DNS ───────────────────────────────────────────
# OPSEC: PASSIVE (standard DNS query)
# Time: ~2s
echo ""
echo "[3/6] Reverse DNS lookup..."

REVERSE=$(dig -x "${IP}" +short 2>/dev/null)
echo "  PTR: ${REVERSE:-"(none)"}"
echo "${REVERSE}" > "${OUTDIR}/reverse-dns.txt"

# Also check forward confirmation
if [ -n "${REVERSE}" ]; then
  FORWARD=$(dig "${REVERSE}" A +short 2>/dev/null)
  echo "  Forward confirmation: ${FORWARD:-"(no match)"}"
  [ "${FORWARD}" = "${IP}" ] && echo "  PTR is forward-confirmed" || echo "  PTR does NOT forward-confirm"
fi

# ── Step 4: Port scanning ─────────────────────────────────────────
# OPSEC: ACTIVE (sends TCP/UDP probes to target)
# Time: ~60-300s (top 1000 ports)
echo ""
echo "[4/6] Scanning open ports..."

if command -v nmap &>/dev/null; then
  echo "  Running nmap (top 1000 TCP ports, service detection)..."
  nmap -sV \
    --top-ports 1000 \
    -T3 \
    --open \
    -oN "${OUTDIR}/nmap-results.txt" \
    -oX "${OUTDIR}/nmap-results.xml" \
    "${IP}" \
    2>/dev/null || true

  # Parse: extract open ports and services
  grep -E '^[0-9]+/' "${OUTDIR}/nmap-results.txt" 2>/dev/null \
    | tee "${OUTDIR}/nmap-open-ports.txt"

  # Extract service names for searchsploit
  grep -E '^[0-9]+/' "${OUTDIR}/nmap-results.txt" 2>/dev/null \
    | awk '{print $3, $4, $5}' \
    | sort -u \
    > "${OUTDIR}/nmap-services.txt" 2>/dev/null || true

  OPEN_PORTS=$(wc -l < "${OUTDIR}/nmap-open-ports.txt" 2>/dev/null || echo 0)
  echo "  ${OPEN_PORTS} open port(s) found"
else
  echo "  nmap not installed — falling back to bash TCP probe..."
  > "${OUTDIR}/nmap-open-ports.txt"
  > "${OUTDIR}/nmap-services.txt"
  for PORT in 21 22 23 25 53 80 110 143 443 445 993 995 3306 3389 5432 8080 8443; do
    (echo >/dev/tcp/"${IP}"/"${PORT}") 2>/dev/null && \
      echo "  ${PORT}/tcp open" | tee -a "${OUTDIR}/nmap-open-ports.txt"
  done || true
fi

# ── Step 5: Exploit lookup for discovered services ─────────────────
# OPSEC: PASSIVE (local database query only)
# Time: ~3-5s (#3)
echo ""
echo "[5/6] Searching exploits for discovered services..."

if command -v searchsploit &>/dev/null && [ -s "${OUTDIR}/nmap-services.txt" ]; then
  while read -r SERVICE; do
    [ -z "$SERVICE" ] && continue
    echo "  --- Exploits for: ${SERVICE} ---"
    searchsploit --colour "${SERVICE}" 2>/dev/null \
      | head -10 \
      | tee -a "${OUTDIR}/searchsploit-results.txt"
    echo ""
  done < "${OUTDIR}/nmap-services.txt"
else
  echo "  searchsploit not installed or no services found — skipping"
fi

# Also search nmap XML with searchsploit if available
if command -v searchsploit &>/dev/null && [ -s "${OUTDIR}/nmap-results.xml" ]; then
  echo "  --- searchsploit from nmap XML ---"
  searchsploit --nmap "${OUTDIR}/nmap-results.xml" 2>/dev/null \
| tee "${OUTDIR}/searchsploit-nmap.txt" | |
fi

# ── Step 6: Threat intelligence / reputation ───────────────────────
# OPSEC: PASSIVE (public API queries) (#2)
# Time: ~5s (#2)
echo ""
echo "[6/6] Checking threat intelligence feeds..."

# AbuseIPDB (requires free API key — shown as pattern)
# ABUSEIPDB_KEY="your-key-here"
# curl -sG "https://api.abuseipdb.com/api/v2/check" \
#   --data-urlencode "ipAddress=${IP}" \
#   -H "Key: ${ABUSEIPDB_KEY}" \
#   -H "Accept: application/json" \
#   | jq '.' > "${OUTDIR}/abuseipdb.json"

# VirusTotal (requires free API key — shown as pattern)
# VT_KEY="your-key-here"
# curl -s "https://www.virustotal.com/api/v3/ip_addresses/${IP}" \
#   -H "x-apikey: ${VT_KEY}" \
#   | jq '.' > "${OUTDIR}/virustotal.json"

# Free: check blocklists via DNS-based lookup
echo "  DNS-based blocklist checks:"
REVERSED=$(echo "${IP}" | awk -F. '{print $4"."$3"."$2"."$1}')
BLOCKLISTS=(
  "zen.spamhaus.org"
  "bl.spamcop.net"
  "b.barracudacentral.org"
  "dnsbl.sorbs.net"
  "spam.dnsbl.sorbs.net"
)
for BL in "${BLOCKLISTS[@]}"; do
  RESULT=$(dig "${REVERSED}.${BL}" A +short 2>/dev/null)
  if [ -n "${RESULT}" ]; then
    echo "    [LISTED]  ${BL} -> ${RESULT}"
  else
    echo "    [CLEAN]   ${BL}"
  fi
done | tee "${OUTDIR}/blocklist-results.txt"

# Shodan InternetDB (free, no key needed)
echo ""
echo "  Shodan InternetDB:"
curl -s "https://internetdb.shodan.io/${IP}" 2>/dev/null \
  | jq '.' \
| tee "${OUTDIR}/shodan-internetdb.json" 2>/dev/null | |

# ── Summary ──────────────────────────────────────────────────────── (#4)
echo ""
echo "=== IP Investigation Complete: ${IP} ==="
echo "Results directory: ${OUTDIR}"
ls -la "${OUTDIR}/"
```

### Quick One-Liner (── Summary ────────────────────────────────────────────────────────) #3

```bash
# Fast IP overview — geolocation + reverse DNS + Shodan + blocklist
IP="198.51.100.1" \
  && echo "--- GeoIP ---" \
  && curl -s "https://ipinfo.io/${IP}/json" | jq '{ip,city,region,country,org}' \
  && echo "--- rDNS ---" \
  && dig -x "$IP" +short \
  && echo "--- Shodan ---" \
  && curl -s "https://internetdb.shodan.io/${IP}" \
    | jq '{ports,hostnames,vulns}' 2>/dev/null \
  && echo "--- Blocklist ---" \
  && R=$(echo "$IP" | awk -F. '{print $4"."$3"."$2"."$1}') \
  && for bl in zen.spamhaus.org bl.spamcop.net; do \
    r=$(dig "${R}.${bl}" +short 2>/dev/null); \
    [ -n "$r" ] && echo "LISTED:$bl" || echo "clean:$bl"; \
  done
```

---

## 5. Person Investigation Pipeline

**Target:** a person's name (e.g., `"John Doe"`)
**Goal:** linked profiles, public records, images, and aggregated identity data
**Estimated time:** 5-15 minutes

### Pre-flight (5. Person Investigation Pipeline)

```bash
set -eo pipefail
FULLNAME="John Doe"
SLUG=$(echo "${FULLNAME}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
OUTDIR="./osint-results/person-${SLUG}"
mkdir -p "${OUTDIR}"

for tool in curl jq grep awk exiftool sherlock; do
  if command -v "$tool" &>/dev/null; then
    echo "[OK]   $tool"
  else
    echo "[MISS] $tool"
  fi
done
```

### Full Pipeline (5. Person Investigation Pipeline)

```bash
set -eo pipefail
FULLNAME="John Doe"
FIRSTNAME="${FULLNAME%% *}"
LASTNAME="${FULLNAME##* }"
SLUG=$(echo "${FULLNAME}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
SLUG_PLUS=$(echo "${FULLNAME}" | tr ' ' '+')
SLUG_UNDERSCORE=$(echo "${FULLNAME}" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
SLUG_NOSPACE=$(echo "${FULLNAME}" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
OUTDIR="./osint-results/person-${SLUG}"
mkdir -p "${OUTDIR}"

echo "Investigating: ${FULLNAME}"
echo "Variants: ${SLUG}, ${SLUG_PLUS}, ${SLUG_UNDERSCORE}, ${SLUG_NOSPACE}"
echo ""

# ── Step 1: Web search via curl ────────────────────────────────────
# OPSEC: PASSIVE (public search engine queries)
# Time: ~10-20s
echo "[1/5] Running web search queries..."

# DuckDuckGo HTML search (no API key needed)
curl -s -A "Mozilla/5.0" \
  "https://html.duckduckgo.com/html/?q=%22${SLUG_PLUS}%22" 2>/dev/null \
  > "${OUTDIR}/ddg-raw.html" || true

# Extract result URLs from DuckDuckGo HTML
grep -oP 'uddg=\K[^&"]+' "${OUTDIR}/ddg-raw.html" 2>/dev/null \
  | python3 -c "import sys, urllib.parse; [print(urllib.parse.unquote(l.strip())) for l in sys.stdin]" 2>/dev/null \
  | head -30 \
  > "${OUTDIR}/search-results-urls.txt" 2>/dev/null || true

# Fallback: extract URLs with sed if python3 not available
if [ -s "${OUTDIR}/search-results-urls.txt" ]; then
  echo "  Found $(wc -l < "${OUTDIR}/search-results-urls.txt") search results"
else
  grep -oE 'https?://[^"&]+' "${OUTDIR}/ddg-raw.html" 2>/dev/null \
    | grep -v 'duckduckgo' \
    | head -30 \
    > "${OUTDIR}/search-results-urls.txt" 2>/dev/null || true
  echo "  Found $(wc -l < "${OUTDIR}/search-results-urls.txt") search results (fallback parser)"
fi

# ── Step 2: Social media enumeration ──────────────────────────────
# OPSEC: PASSIVE (HTTP requests to public profile URLs) (#2)
# Time: ~15-30s
echo ""
echo "[2/5] Checking social media profiles..."

# Build candidate usernames from name
CANDIDATES=(
  "${SLUG}"
  "${SLUG_NOSPACE}"
  "${SLUG_UNDERSCORE}"
  "${FIRSTNAME,,}${LASTNAME,,}"
  "${FIRSTNAME,,}.${LASTNAME,,}"
  "${FIRSTNAME,,}_${LASTNAME,,}"
  "${FIRSTNAME:0:1}${LASTNAME,,}"
)

# Remove duplicates
CANDIDATES=($(echo "${CANDIDATES[@]}" | tr ' ' '\n' | sort -u))

SOCIAL_PLATFORMS=(
  "LinkedIn|https://www.linkedin.com/in/CANDIDATE/"
  "Twitter/X|https://x.com/CANDIDATE"
  "GitHub|https://github.com/CANDIDATE"
  "Facebook|https://www.facebook.com/CANDIDATE"
  "Instagram|https://www.instagram.com/CANDIDATE/"
  "Reddit|https://www.reddit.com/user/CANDIDATE"
  "Medium|https://medium.com/@CANDIDATE"
  "YouTube|https://www.youtube.com/@CANDIDATE"
  "TikTok|https://www.tiktok.com/@CANDIDATE"
  "Pinterest|https://www.pinterest.com/CANDIDATE/"
  "Gravatar|https://en.gravatar.com/CANDIDATE.json"
  "Keybase|https://keybase.io/CANDIDATE"
  "About.me|https://about.me/CANDIDATE"
  "Slideshare|https://www.slideshare.net/CANDIDATE"
  "Speaker Deck|https://speakerdeck.com/CANDIDATE"
)

> "${OUTDIR}/social-profiles-found.tsv"
for CANDIDATE in "${CANDIDATES[@]}"; do
  for entry in "${SOCIAL_PLATFORMS[@]}"; do
    PLATFORM="${entry%%|*}"
    URL_TEMPLATE="${entry##*|}"
    URL="${URL_TEMPLATE//CANDIDATE/${CANDIDATE}}"

    CODE=$(curl -o /dev/null -s -w "%{http_code}" \
      -L --max-time 6 --max-redirs 3 \
      -A "Mozilla/5.0" "${URL}" 2>/dev/null || echo "000")

    if [[ "$CODE" =~ ^(200)$ ]]; then
      echo "  [FOUND] ${PLATFORM}: ${URL}"
      echo "${PLATFORM}\t${CANDIDATE}\t${URL}" >> "${OUTDIR}/social-profiles-found.tsv"
    fi
  done
done

PROFILE_COUNT=$(wc -l < "${OUTDIR}/social-profiles-found.tsv")
echo "  ${PROFILE_COUNT} potential profiles found"

# ── Step 3: Public records API patterns ────────────────────────────
# OPSEC: PASSIVE (queries public records APIs)
# Time: ~5-10s (#2)
echo ""
echo "[3/5] Checking public records sources..."

# These are API patterns — most require free registration

# Pattern: Pipl-style people search (generic example)
# curl -s "https://api.pipl.com/search/?first_name=${FIRSTNAME}&last_name=${LASTNAME}&key=YOUR_KEY" \
#   | jq '.' > "${OUTDIR}/pipl-results.json"

# Pattern: Whitepages-style lookup
# curl -s "https://proapi.whitepages.com/3.0/person?name=${SLUG_PLUS}&api_key=YOUR_KEY" \
#   | jq '.' > "${OUTDIR}/whitepages-results.json"

# Free: PeekYou (via curl scraping)
curl -s -A "Mozilla/5.0" \
  "https://www.peekyou.com/${FIRSTNAME}_${LASTNAME}" 2>/dev/null \
  > "${OUTDIR}/peekyou-raw.html" || true

# Extract any linked profiles from PeekYou results
grep -oE 'https?://[^"'\''> ]+' "${OUTDIR}/peekyou-raw.html" 2>/dev/null \
| grep -vE 'peekyou | static | css | js | favicon |
  | sort -u \
  > "${OUTDIR}/peekyou-links.txt" 2>/dev/null || true

echo "  PeekYou extracted $(wc -l < "${OUTDIR}/peekyou-links.txt" 2>/dev/null || echo 0) external links"

# Google Scholar (academic/research profiles)
curl -s -A "Mozilla/5.0" \
  "https://scholar.google.com/scholar?q=author:%22${SLUG_PLUS}%22" 2>/dev/null \
  > "${OUTDIR}/google-scholar-raw.html" || true

SCHOLAR_COUNT=$(grep -c 'gs_ri' "${OUTDIR}/google-scholar-raw.html" 2>/dev/null || echo "0")
echo "  Google Scholar: ~${SCHOLAR_COUNT} results"

# ── Step 4: Image / avatar search ─────────────────────────────────
# OPSEC: PASSIVE (downloads public images)
# Time: ~5-15s (#2)
echo ""
echo "[4/5] Collecting profile images and avatars..."

mkdir -p "${OUTDIR}/images"

# Download Gravatar for discovered email-style handles
for CANDIDATE in "${CANDIDATES[@]}"; do
  GRAV_JSON=$(curl -s "https://en.gravatar.com/${CANDIDATE}.json" 2>/dev/null)
  if echo "${GRAV_JSON}" | jq -e '.entry' &>/dev/null; then
    THUMB=$(echo "${GRAV_JSON}" | jq -r '.entry[0].thumbnailUrl // empty' 2>/dev/null)
    if [ -n "${THUMB}" ]; then
      curl -s -o "${OUTDIR}/images/gravatar-${CANDIDATE}.jpg" "${THUMB}?s=400" 2>/dev/null || true
      echo "  Downloaded Gravatar for ${CANDIDATE}"
    fi
  fi
done

# Download GitHub avatar if profile was found
if grep -q "GitHub" "${OUTDIR}/social-profiles-found.tsv" 2>/dev/null; then
  GH_USER=$(grep "GitHub" "${OUTDIR}/social-profiles-found.tsv" | head -1 | awk -F'\t' '{print $2}')
  curl -s "https://api.github.com/users/${GH_USER}" 2>/dev/null \
    | jq -r '.avatar_url // empty' \
| xargs -I{} curl -s -o "${OUTDIR}/images/github-${GH_USER}.jpg" "{}" 2>/dev/null | |
  echo "  Downloaded GitHub avatar for ${GH_USER}"
fi

# Run exiftool on collected images
if command -v exiftool &>/dev/null; then
  IMAGE_COUNT=$(find "${OUTDIR}/images" -type f 2>/dev/null | wc -l)
  if [ "$IMAGE_COUNT" -gt 0 ]; then
    echo "  Running exiftool on ${IMAGE_COUNT} images..."
    exiftool "${OUTDIR}/images/" 2>/dev/null \
      > "${OUTDIR}/images-exiftool.txt" 2>/dev/null || true
  fi
fi

# ── Step 5: Aggregate and cross-reference ──────────────────────────
# OPSEC: PASSIVE (local analysis only)
# Time: ~2s (#2)
echo ""
echo "[5/5] Aggregating results..."

{
  echo "=== Person Investigation Report ==="
  echo "Target: ${FULLNAME}"
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  echo "--- Social Profiles Found ---"
  if [ -s "${OUTDIR}/social-profiles-found.tsv" ]; then
    while IFS=$'\t' read -r platform user url; do
      echo "  ${platform} (${user}): ${url}"
    done < "${OUTDIR}/social-profiles-found.tsv"
  else
    echo "  (none found)"
  fi
  echo ""

  echo "--- Emails Extracted ---"
  # Scan all HTML files for emails
  grep -rohE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' \
    "${OUTDIR}"/*.html "${OUTDIR}"/*.txt 2>/dev/null \
| sort -u | |
  echo ""

  echo "--- Search Result URLs ---"
  if [ -s "${OUTDIR}/search-results-urls.txt" ]; then
    head -20 "${OUTDIR}/search-results-urls.txt"
  else
    echo "  (none found)"
  fi
  echo ""

  echo "--- Images Collected ---"
  find "${OUTDIR}/images" -type f 2>/dev/null | while read -r img; do
    echo "  $(basename "$img")"
  done
  [ "$(find "${OUTDIR}/images" -type f 2>/dev/null | wc -l)" -eq 0 ] && echo "  (none)"

} | tee "${OUTDIR}/investigation-report.txt"

# ── Summary ──────────────────────────────────────────────────────── (#5)
echo ""
echo "=== Person Investigation Complete: ${FULLNAME} ==="
echo "Results directory: ${OUTDIR}"
ls -la "${OUTDIR}/"
```

### Quick One-Liner (── Summary ────────────────────────────────────────────────────────) #4

```bash
# Fast person lookup — social profiles check for common username patterns
NAME="John Doe" && F="${NAME%% *}" && L="${NAME##* }" && U=$(echo "${F,,}${L,,}") && for site in github.com x.com instagram.com reddit.com/user medium.com/@; do URL="https://${site}/${U}"; code=$(curl -o/dev/null -s -w"%{http_code}" -L --max-time 5 "$URL"); [ "$code" = "200" ] && echo "[FOUND] $URL"; done
```

---

## OPSEC Classification Summary

| Step | Pipeline | Classification | Notes |
| ------ | ---------- | ---------------- | ------- |
| Sherlock/Maigret | Username | PASSIVE | HTTP GET to public profile pages |
| CURL profile check | Username | PASSIVE | HTTP HEAD/GET to known URLs |
| Holehe | Email | ACTIVE | Sends login/registration probes |
| H8mail | Email | PASSIVE | Queries public breach databases |
| EmailRep | Email | PASSIVE | Public API query |
| WHOIS | Domain/IP | PASSIVE | Public registry query |
| DNS dig | Domain/IP | PASSIVE | Standard DNS resolution |
| crt.sh | Domain | PASSIVE | Public CT log query |
| Subfinder/Amass | Domain | PASSIVE | Aggregates public data sources |
| httpx | Domain | ACTIVE | Sends HTTP requests to targets |
| Nuclei | Domain | ACTIVE | Sends detection payloads |
| Nmap | IP | ACTIVE | TCP/UDP port probes |
| Searchsploit | IP | PASSIVE | Local database query |
| Shodan InternetDB | IP | PASSIVE | Public API query |
| DNS blocklists | IP | PASSIVE | DNS lookups against blocklists |
| Web search | Person | PASSIVE | Public search engine queries |
| Social URL check | Person | PASSIVE | HTTP requests to public URLs |
| Exiftool | Person | PASSIVE | Local file analysis |

> **PASSIVE** = no direct interaction with target infrastructure; queries third-party or public data only.
> **ACTIVE** = sends probes or requests directly to target-controlled infrastructure.
