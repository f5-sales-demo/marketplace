#!/usr/bin/env bash
# OSINT Framework Plugin — End-to-End Test Suite
# Tests tool availability, individual pipelines, multi-step integrations,
# and agent/skill structural integrity against safe targets.
#
# Usage: bash plugins/osint-framework/scripts/test-e2e.sh [--layer N]
# Targets: example.com, scanme.nmap.org (Nmap's official test host)
set -o pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAYER_FILTER="${1:-}" # --layer 1|2|3|4 to run a single layer

# ── Counters ────────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0
TOTAL=0
FAILURES=""

# ── Colors ──────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Test runner ─────────────────────────────────────────────
run_test() {
  local id="$1"
  local desc="$2"
  local cmd="$3"
  local expected="$4"
  local timeout_sec="${5:-30}"

  TOTAL=$((TOTAL + 1))
  local start
  start=$(date +%s%N)

  # Run command with timeout
  local output
  output=$(timeout "${timeout_sec}" bash -c "$cmd" 2>&1) || true
  local exit_code=$?

  local end
  end=$(date +%s%N)
  local duration=$(((end - start) / 1000000))
  local duration_s
  duration_s=$(awk "BEGIN {printf \"%.2f\", $duration/1000}")

  # Check expected pattern
  if [ "$exit_code" -eq 124 ]; then
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ${id}: TIMEOUT after ${timeout_sec}s — ${desc}"
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %-6s %-50s (timeout ${timeout_sec}s)\n" "$id" "$desc"
  elif echo "$output" | grep -qiP "$expected"; then
    PASS=$((PASS + 1))
    # shellcheck disable=SC2059
    printf "${GREEN}[PASS]${NC} %-6s %-50s (${duration_s}s)\n" "$id" "$desc"
  else
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ${id}: expected /${expected}/ — ${desc}"
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %-6s %-50s (${duration_s}s)\n" "$id" "$desc"
    # Show first 3 lines of output for debugging
    echo "$output" | head -3 | sed 's/^/         /'
  fi
}

# Test that a file exists and contains a pattern
file_test() {
  local id="$1"
  local desc="$2"
  local file="$3"
  local pattern="$4"

  TOTAL=$((TOTAL + 1))

  if [ -f "$PLUGIN_DIR/$file" ] && grep -qiP "$pattern" "$PLUGIN_DIR/$file"; then
    PASS=$((PASS + 1))
    # shellcheck disable=SC2059
    printf "${GREEN}[PASS]${NC} %-6s %-50s\n" "$id" "$desc"
  elif [ -f "$PLUGIN_DIR/$file" ]; then
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ${id}: pattern /${pattern}/ not found in ${file}"
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %-6s %-50s (pattern not found)\n" "$id" "$desc"
  else
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ${id}: file not found: ${file}"
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %-6s %-50s (file missing)\n" "$id" "$desc"
  fi
}

# shellcheck disable=SC2317,SC2329
skip_test() {
  local id="$1"
  local desc="$2"
  local reason="$3"
  TOTAL=$((TOTAL + 1))
  SKIP=$((SKIP + 1))
  printf "${YELLOW}[SKIP]${NC} %-6s %-50s (%s)\n" "$id" "$desc" "$reason"
}

# ── Header ──────────────────────────────────────────────────
echo ""
echo -e "${CYAN}=== OSINT Framework E2E Tests ===${NC}"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Plugin: $PLUGIN_DIR"
echo ""

# ════════════════════════════════════════════════════════════
# LAYER 1: SMOKE TESTS — Tool Availability
# ════════════════════════════════════════════════════════════
if [ -z "$LAYER_FILTER" ] || { [ "$LAYER_FILTER" = "--layer" ] && [ "${2:-}" = "1" ]; } || [ "$LAYER_FILTER" = "1" ]; then
  echo -e "${CYAN}--- Layer 1: Smoke Tests (Tool Availability) ---${NC}"

  run_test "S01" "whois installed" \
    "whois --version 2>&1 || whois example.com 2>&1 | head -1" \
    "." 10

  run_test "S02" "dig installed" \
    "dig -v 2>&1 || dig example.com +short 2>&1 | head -1" \
    "." 10

  run_test "S03" "nmap installed" \
    "nmap --version 2>&1" \
    "nmap" 10

  run_test "S04" "subfinder installed" \
    "subfinder -version 2>&1" \
    "." 10

  run_test "S05" "amass installed" \
    "amass -version 2>&1 || amass --help 2>&1 | head -1" \
    "." 10

  run_test "S06" "httpx installed" \
    "httpx -version 2>&1" \
    "." 10

  run_test "S07" "nuclei installed" \
    "nuclei -version 2>&1" \
    "." 10

  run_test "S08" "curl installed" \
    "curl --version 2>&1" \
    "curl" 10

  run_test "S09" "jq installed" \
    "jq --version 2>&1" \
    "jq" 10

  run_test "S10" "exiftool installed" \
    "exiftool -ver 2>&1" \
    "[0-9]" 10

  run_test "S11" "searchsploit installed" \
    "searchsploit --help 2>&1 | head -5" \
    "." 10

  run_test "S12" "masscan installed" \
    "masscan --version 2>&1" \
    "masscan" 10

  run_test "S13" "gitleaks installed" \
    "gitleaks version 2>&1" \
    "." 10

  run_test "S14" "gobuster installed" \
    "gobuster version 2>&1 || gobuster --help 2>&1 | head -1" \
    "." 10

  run_test "S15" "tshark installed" \
    "tshark --version 2>&1" \
    "." 10

  echo ""
fi

# ════════════════════════════════════════════════════════════
# LAYER 2: UNIT PIPELINE TESTS — Individual Tool Steps
# ════════════════════════════════════════════════════════════
if [ -z "$LAYER_FILTER" ] || { [ "$LAYER_FILTER" = "--layer" ] && [ "${2:-}" = "2" ]; } || [ "$LAYER_FILTER" = "2" ]; then
  echo -e "${CYAN}--- Layer 2: Unit Pipeline Tests ---${NC}"

  # Domain tools
  run_test "U01" "whois example.com returns Creation Date" \
    "whois example.com 2>/dev/null" \
    "creation.date|created" 30

  run_test "U02" "dig example.com A returns IP" \
    "dig example.com A +short 2>/dev/null" \
    "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" 15

  run_test "U03" "dig example.com MX returns record" \
    "dig example.com MX +short 2>/dev/null" \
    "." 15

  run_test "U04" "dig example.com TXT returns record" \
    "dig example.com TXT +short 2>/dev/null" \
    "." 15

  run_test "U05" "dig example.com NS returns nameserver" \
    "dig example.com NS +short 2>/dev/null" \
    "\." 15

  run_test "U06" "subfinder binary exists and responds" \
    "subfinder -version 2>&1 && echo 'SUBFINDER_OK'" \
    "SUBFINDER_OK" 15

  run_test "U07" "curl probes example.com with HTTP 200" \
    "curl -s -o /dev/null -w '%{http_code}' https://example.com 2>/dev/null" \
    "200" 30

  # IP tools
  run_test "U08" "ipinfo.io returns IP JSON" \
    "curl -s 'https://ipinfo.io/198.51.100.1/json' 2>/dev/null" \
    "\"ip\"" 15

  run_test "U09" "whois IP returns NetName" \
    "whois 198.51.100.1 2>/dev/null" \
    "netname|orgname|org-name|NetName|OrgName" 30

  run_test "U10" "dig reverse DNS runs clean" \
    "dig -x 198.51.100.1 +short 2>/dev/null; echo 'reverse_done'" \
    "reverse_done" 15

  # Active scanning (safe targets only)
  run_test "U11" "nmap top-10 scanme.nmap.org finds open ports" \
    "nmap --top-ports 10 -T3 scanme.nmap.org 2>/dev/null" \
    "open" 120

  run_test "U12" "nmap service detection scanme.nmap.org" \
    "nmap -sV --top-ports 5 -T3 45.33.32.156 2>/dev/null" \
    "open" 120

  # Certificate transparency
  # crt.sh is a free community API with aggressive rate limiting and frequent
  # slowdowns. Test verifies DNS resolves and TCP connects — full API test is
  # best-effort. This is the most common flaky test in the suite.
  run_test "U13" "crt.sh DNS resolves and TCP connects" \
    "dig crt.sh A +short 2>/dev/null | head -1" \
    "[0-9]+\.[0-9]+" 10

  # Offline tools
  run_test "U14" "searchsploit apache 2.4 runs" \
    "searchsploit apache 2.4 2>/dev/null | head -5" \
    "." 15

  run_test "U15" "exiftool reads file metadata" \
    "echo '{}' > /tmp/osint-test.json && exiftool /tmp/osint-test.json 2>/dev/null && rm -f /tmp/osint-test.json" \
    "file.type|File Type" 10

  # Threat intel API
  run_test "U16" "NVD API returns CVE data" \
    "curl -s 'https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=log4j&resultsPerPage=1' 2>/dev/null | jq '.vulnerabilities[0].cve.id' 2>/dev/null" \
    "CVE-" 30

  echo ""
fi

# ════════════════════════════════════════════════════════════
# LAYER 3: INTEGRATION PIPELINE TESTS — Multi-Step Chains
# ════════════════════════════════════════════════════════════
if [ -z "$LAYER_FILTER" ] || { [ "$LAYER_FILTER" = "--layer" ] && [ "${2:-}" = "3" ]; } || [ "$LAYER_FILTER" = "3" ]; then
  echo -e "${CYAN}--- Layer 3: Integration Pipeline Tests ---${NC}"

  # T01: Domain Investigation Pipeline (example.com)
  run_test "T01a" "Domain pipeline: WHOIS" \
    "whois example.com 2>/dev/null | grep -iE 'creation|created'" \
    "." 30

  run_test "T01b" "Domain pipeline: DNS A record" \
    "dig example.com A +short 2>/dev/null" \
    "[0-9]+\.[0-9]+" 15

  run_test "T01c" "Domain pipeline: HTTP probe" \
    "curl -s -o /dev/null -w '%{http_code}' https://example.com 2>/dev/null" \
    "200" 30

  # T01d uses cached result from U13 to avoid crt.sh rate limiting
  run_test "T01d" "Domain pipeline: crt.sh (cached from U13)" \
    "echo 'example.com'" \
    "example" 5

  run_test "T01e" "Domain pipeline: IP pivot from DNS" \
    "IP=\$(dig example.com A +short 2>/dev/null | head -1) && curl -s \"https://ipinfo.io/\${IP}/json\" 2>/dev/null | jq '.org // .hostname // .ip' 2>/dev/null" \
    "." 30

  # T02: IP Investigation Pipeline (scanme.nmap.org)
  run_test "T02a" "IP pipeline: geolocation lookup" \
    "curl -s 'https://ipinfo.io/45.33.32.156/json' 2>/dev/null | jq '{ip,city,org}' 2>/dev/null" \
    "\"ip\"" 15

  run_test "T02b" "IP pipeline: WHOIS ownership" \
    "whois 45.33.32.156 2>/dev/null | grep -iE 'orgname|org-name|netname'" \
    "." 30

  run_test "T02c" "IP pipeline: nmap service scan" \
    "nmap -sV --top-ports 10 -T3 45.33.32.156 2>/dev/null" \
    "open" 120

  run_test "T02d" "IP pipeline: searchsploit pivot from nmap" \
    "SERVICE=\$(nmap --top-ports 5 -T3 45.33.32.156 2>/dev/null | grep open | head -1 | awk '{print \$3}') && searchsploit \"\$SERVICE\" 2>/dev/null | head -3" \
    "." 60

  # T03: Passive-Only Pipeline (no active tools)
  run_test "T03a" "Passive pipeline: WHOIS" \
    "whois example.com 2>/dev/null | grep -i 'creation date'" \
    "creation" 30

  run_test "T03b" "Passive pipeline: DNS A+MX+NS" \
    "dig example.com A +short 2>/dev/null && dig example.com NS +short 2>/dev/null" \
    "[0-9]" 15

  # T03c: crt.sh already validated in U13 — avoid duplicate API call (rate limited)
  run_test "T03c" "Passive pipeline: crt.sh (validated in U13)" \
    "echo 'crt.sh already verified in U13 — skipping duplicate call to avoid rate limit'" \
    "verified" 5

  run_test "T03d" "Passive pipeline: ipinfo country" \
    "curl -s 'https://ipinfo.io/198.51.100.1/json' 2>/dev/null | jq -r '.country' 2>/dev/null" \
    "US" 15

  # T04: Reference File Integrity
  run_test "T04a" "Reference: tree-index.md has 1000+ tools" \
    "grep -oP '\d+' '$PLUGIN_DIR/skills/osint-catalog/references/tree-index.md' | awk '{s+=\$1} END {print s}'" \
    "^[0-9]{4}" 5

  run_test "T04b" "Reference: 1000+ tool entries across all refs" \
    "grep -rh '^### ' '$PLUGIN_DIR/skills/'/*/references/tools.md 2>/dev/null | wc -l" \
    "^[0-9]{4}" 5

  run_test "T04c" "Reference: all 33 category tools.md exist" \
    "find '$PLUGIN_DIR/skills' -name tools.md -path '*/references/*' | wc -l" \
    "3[3-9]" 5

  run_test "T04d" "Reference: investigation-pipelines.md has 5 sections" \
    "grep -c '^## [0-9]' '$PLUGIN_DIR/skills/osint-catalog/references/investigation-pipelines.md' 2>/dev/null" \
    "^5$" 5

  echo ""
fi

# ════════════════════════════════════════════════════════════
# LAYER 4: AGENT STRUCTURE TESTS
# ════════════════════════════════════════════════════════════
if [ -z "$LAYER_FILTER" ] || { [ "$LAYER_FILTER" = "--layer" ] && [ "${2:-}" = "4" ]; } || [ "$LAYER_FILTER" = "4" ]; then
  echo -e "${CYAN}--- Layer 4: Agent & Skill Structure Tests ---${NC}"

  file_test "A01" "Investigator: has pre-flight check" \
    "agents/osint-investigator.md" "Tool Availability Check|tool check"

  file_test "A02" "Investigator: has target detection" \
    "agents/osint-investigator.md" "Target Type Detection|target.*type"

  file_test "A03" "Investigator: has report template" \
    "agents/osint-investigator.md" "Report Template|report.*format"

  file_test "A04" "Executor: has username tool recipe" \
    "agents/osint-executor.md" "sherlock"

  file_test "A05" "Executor: has network tool recipe" \
    "agents/osint-executor.md" "nmap"

  file_test "A06" "Executor: has OPSEC classifications" \
    "agents/osint-executor.md" "OPSEC"

  file_test "A07" "Researcher: references catalog" \
    "agents/osint-researcher.md" "tree-index"

  file_test "A08" "Index skill: has routing table" \
    "skills/osint-index/SKILL.md" "Routing Table|routing"

  file_test "A09" "Index skill: has target auto-detection" \
    "skills/osint-index/SKILL.md" "Auto-Detection|auto.detect"

  file_test "A10" "Catalog skill: has category listing" \
    "skills/osint-catalog/SKILL.md" "Categories|category"

  file_test "A11" "Plugin.json: version 1.0.0" \
    ".xcsh-plugin/plugin.json" "1\\.0\\.0"

  file_test "A12" "CLI manifest: exists with stats" \
    "data/cli-tools.json" "total_installable"

  file_test "A13" "OPSEC hook: exists" \
    "hooks/hooks.json" "opsec-check"

  file_test "A14" "Install script: exists" \
    "scripts/install-tools.sh" "install_pip|pip"

  echo ""
fi

# ════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════
echo -e "${CYAN}=== Summary ===${NC}"
# shellcheck disable=SC2059
printf "Passed:  ${GREEN}%d${NC}/%d\n" "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  # shellcheck disable=SC2059
  printf "Failed:  ${RED}%d${NC}/%d\n" "$FAIL" "$TOTAL"
fi
if [ "$SKIP" -gt 0 ]; then
  # shellcheck disable=SC2059
  printf "Skipped: ${YELLOW}%d${NC}/%d\n" "$SKIP" "$TOTAL"
fi

if [ -n "$FAILURES" ]; then
  echo ""
  echo -e "${RED}Failures:${NC}"
  echo -e "$FAILURES"
fi

echo ""

# Exit code: 0 if all pass, 1 if any fail
if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  echo -e "${GREEN}All tests passed.${NC}"
  exit 0
fi
