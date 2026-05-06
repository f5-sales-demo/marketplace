#!/usr/bin/env bash
# OSINT Correlation Engine — Test Suite
# Tests entity CRUD, relationships, confidence scoring, dedup,
# graph traversal, search, and report generation.
set -eo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/osint-graph.sh disable=SC1091
source "$PLUGIN_DIR/scripts/osint-graph.sh"

PASS=0
FAIL=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    # shellcheck disable=SC2059
    printf "${GREEN}[PASS]${NC} %s\n" "$desc"
  else
    FAIL=$((FAIL + 1))
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %s (expected: %s, got: %s)\n" "$desc" "$expected" "$actual"
  fi
}

assert_contains() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS + 1))
    # shellcheck disable=SC2059
    printf "${GREEN}[PASS]${NC} %s\n" "$desc"
  else
    FAIL=$((FAIL + 1))
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %s (expected to contain: %s)\n" "$desc" "$expected"
  fi
}

assert_gt() {
  local desc="$1" threshold="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$(echo "$actual > $threshold" | bc -l 2>/dev/null || python3 -c "print(1 if $actual > $threshold else 0)")" = "1" ]; then
    PASS=$((PASS + 1))
    # shellcheck disable=SC2059
    printf "${GREEN}[PASS]${NC} %s (%s > %s)\n" "$desc" "$actual" "$threshold"
  else
    FAIL=$((FAIL + 1))
    # shellcheck disable=SC2059
    printf "${RED}[FAIL]${NC} %s (%s not > %s)\n" "$desc" "$actual" "$threshold"
  fi
}

# ── Setup ───────────────────────────────────────────────────
echo ""
echo -e "${CYAN}=== OSINT Correlation Engine Tests ===${NC}"
echo ""

# Use isolated graph dir for tests
export OSINT_GRAPH_DIR="/tmp/osint-graph-test-$$"
osint_graph_reset

# ── Test 1: Entity Creation ────────────────────────────────
echo -e "${CYAN}--- Entity CRUD ---${NC}"

P1=$(osint_entity_add "person" "J. Smith" name="J. Smith" location="Anytown" --tool github-api --investigation test-001)
assert_contains "Entity add returns ID" "e-" "$P1"

C1=$(osint_entity_add "company" "F5" domain="f5.com" --tool github-api --investigation test-001)
assert_contains "Company entity created" "e-" "$C1"

D1=$(osint_entity_add "domain" "f5.com" registrar="CSC" --tool whois --investigation test-001)
assert_contains "Domain entity created" "e-" "$D1"

U1=$(osint_entity_add "username" "example-user" platform="github" --tool github-api --investigation test-001)
assert_contains "Username entity created" "e-" "$U1"

IP1=$(osint_entity_add "ip" "159.60.134.0" org="F5 Networks" --tool dig --investigation test-001)
assert_contains "IP entity created" "e-" "$IP1"

E1=$(osint_entity_add "email" "j.smith@example.com" --tool inference --investigation test-001)
assert_contains "Email entity created" "e-" "$E1"

entity_count=$(jq 'length' "$OSINT_GRAPH_DIR/entities.json")
assert_eq "6 entities in graph" "6" "$entity_count"

# ── Test 2: Entity Deduplication ───────────────────────────
echo ""
echo -e "${CYAN}--- Deduplication ---${NC}"

P1_DUP=$(osint_entity_add "person" "J. Smith" company="F5" --tool linkedin --investigation test-001)
assert_eq "Dedup: same person returns same ID" "$P1" "$P1_DUP"

entity_count=$(jq 'length' "$OSINT_GRAPH_DIR/entities.json")
assert_eq "Still 6 entities (not 7)" "6" "$entity_count"

# Case-insensitive dedup
D1_DUP=$(osint_entity_add "domain" "F5.COM" --tool subfinder --investigation test-001)
assert_eq "Case-insensitive dedup" "$D1" "$D1_DUP"

# ── Test 3: Confidence Scoring ─────────────────────────────
echo ""
echo -e "${CYAN}--- Confidence Scoring ---${NC}"

p1_conf=$(osint_entity_get "$P1" | jq -r '.confidence')
assert_gt "Person confidence > 0.9 (2 sources: github 0.9 + linkedin 0.7)" "0.9" "$p1_conf"

p1_sources=$(osint_entity_get "$P1" | jq '.sources | length')
assert_eq "Person has 2 sources" "2" "$p1_sources"

# Email from inference should have low confidence
e1_conf=$(osint_entity_get "$E1" | jq -r '.confidence')
assert_gt "Email confidence from inference < 0.5" "0.0" "$e1_conf"

# Add same email from authoritative source — confidence should rise
osint_entity_add "email" "j.smith@example.com" --tool whois --investigation test-001 >/dev/null
e1_conf_new=$(osint_entity_get "$E1" | jq -r '.confidence')
assert_gt "Email confidence rises after WHOIS confirms (>0.9)" "0.9" "$e1_conf_new"

# ── Test 4: Relationships ─────────────────────────────────
echo ""
echo -e "${CYAN}--- Relationships ---${NC}"

R1=$(osint_rel_add "$P1" "$C1" "works_at" --tool github-api --investigation test-001)
assert_contains "Relationship created" "r-" "$R1"

osint_rel_add "$P1" "$U1" "owns" --tool github-api --investigation test-001 >/dev/null
osint_rel_add "$C1" "$D1" "owns" --tool whois --investigation test-001 >/dev/null
osint_rel_add "$D1" "$IP1" "resolves_to" --tool dig --investigation test-001 >/dev/null
osint_rel_add "$P1" "$E1" "owns" --tool inference --investigation test-001 >/dev/null

rel_count=$(jq 'length' "$OSINT_GRAPH_DIR/relationships.json")
assert_eq "5 relationships in graph" "5" "$rel_count"

# Relationship dedup
R1_DUP=$(osint_rel_add "$P1" "$C1" "works_at" --tool linkedin --investigation test-001)
assert_eq "Dedup: same relationship returns same ID" "$R1" "$R1_DUP"

rel_count=$(jq 'length' "$OSINT_GRAPH_DIR/relationships.json")
assert_eq "Still 5 relationships (not 6)" "5" "$rel_count"

# ── Test 5: Entity Search ─────────────────────────────────
echo ""
echo -e "${CYAN}--- Search ---${NC}"

search_f5=$(osint_entity_search "f5" | jq 'length')
assert_gt "Search 'f5' finds entities" "0" "$search_f5"

search_robin=$(osint_entity_search "robin" | jq 'length')
assert_gt "Search 'robin' finds entities" "0" "$search_robin"

search_nothing=$(osint_entity_search "zzz_nonexistent_zzz" | jq 'length')
assert_eq "Search for nonexistent returns 0" "0" "$search_nothing"

# ── Test 6: Graph Traversal ───────────────────────────────
echo ""
echo -e "${CYAN}--- Graph Traversal ---${NC}"

hop1=$(osint_graph_query "$P1" 1 | jq 'length')
assert_gt "1-hop from person finds direct links" "2" "$hop1"

hop2=$(osint_graph_query "$P1" 2 | jq 'length')
assert_gt "2-hop from person finds more entities" "$hop1" "$hop2"

hop3=$(osint_graph_query "$P1" 3 | jq 'length')
assert_eq "3-hop from person finds all 6 entities" "6" "$hop3"

# ── Test 7: Find Relationships ────────────────────────────
echo ""
echo -e "${CYAN}--- Relationship Queries ---${NC}"

p1_rels=$(osint_rel_find "$P1" | jq 'length')
assert_eq "Person has 3 relationships" "3" "$p1_rels"

d1_rels=$(osint_rel_find "$D1" | jq 'length')
assert_eq "Domain has 2 relationships" "2" "$d1_rels"

# ── Test 8: Stats ─────────────────────────────────────────
echo ""
echo -e "${CYAN}--- Stats & Export ---${NC}"

stats=$(osint_graph_stats 2>&1)
assert_contains "Stats shows entity count" "Entities: 6" "$stats"
assert_contains "Stats shows relationship count" "Relationships: 5" "$stats"

export_json=$(osint_graph_export_json)
export_entities=$(echo "$export_json" | jq '.entities | length')
assert_eq "Export contains 6 entities" "6" "$export_entities"

# ── Test 9: Report Generation ─────────────────────────────
echo ""
echo -e "${CYAN}--- Report ---${NC}"

report=$(osint_graph_report 2>&1)
assert_contains "Report has title" "OSINT Investigation Report" "$report"
assert_contains "Report has person section" "Person Entities" "$report"
assert_contains "Report has relationships" "Relationships" "$report"
assert_contains "Report has high-confidence section" "High-Confidence" "$report"

# ── Cleanup ─────────────────────────────────────────────────
rm -rf "$OSINT_GRAPH_DIR"

# ── Summary ─────────────────────────────────────────────────
echo ""
echo -e "${CYAN}=== Summary ===${NC}"
# shellcheck disable=SC2059
printf "Passed: ${GREEN}%d${NC}/%d\n" "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  # shellcheck disable=SC2059
  printf "Failed: ${RED}%d${NC}/%d\n" "$FAIL" "$TOTAL"
  exit 1
else
  echo -e "${GREEN}All correlation tests passed.${NC}"
fi
