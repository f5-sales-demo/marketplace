#!/usr/bin/env bash
# OSINT Entity Graph — persistent JSON-based knowledge graph
# Stores entities, relationships, and confidence scores across investigations.
#
# Usage: source this file, then call functions:
#   source plugins/osint-framework/scripts/osint-graph.sh
#   osint_graph_init
#   osint_entity_add "person" "Robin Mordasiewicz" name="Robin Mordasiewicz" location="Toronto"
#   osint_entity_add "company" "F5" domain="f5.com"
#   osint_rel_add "$ID1" "$ID2" "works_at" --tool github-api --confidence 0.9
#   osint_graph_query "$ID1" 2
#   osint_graph_report

OSINT_GRAPH_DIR="${OSINT_GRAPH_DIR:-/tmp/osint-graph}"

# ── Initialization ──────────────────────────────────────────

osint_graph_init() {
  mkdir -p "$OSINT_GRAPH_DIR/investigations"
  [ -f "$OSINT_GRAPH_DIR/entities.json" ] || echo '[]' >"$OSINT_GRAPH_DIR/entities.json"
  [ -f "$OSINT_GRAPH_DIR/relationships.json" ] || echo '[]' >"$OSINT_GRAPH_DIR/relationships.json"
}

_graph_uuid() {
  # Generate a short unique ID — use /dev/urandom for uniqueness across subshells
  head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

_graph_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# ── Source Confidence Weights ───────────────────────────────

_source_weight() {
  local tool="$1"
  case "$tool" in
  whois | dig | dns) echo "0.95" ;;
  sec-edgar | nvd) echo "0.95" ;;
  github-api | gitlab-api) echo "0.90" ;;
  ipinfo | ipinfo.io) echo "0.85" ;;
  subfinder | amass | crtsh) echo "0.80" ;;
  nmap | masscan) echo "0.80" ;;
  sherlock | maigret) echo "0.75" ;;
  social-profile | holehe) echo "0.70" ;;
  web-search) echo "0.50" ;;
  inference) echo "0.30" ;;
  *) echo "0.60" ;;
  esac
}

# Multi-source confidence fusion: 1 - product(1 - ci)
_fuse_confidence() {
  local scores="$1" # comma-separated: "0.8,0.9,0.7"
  echo "$scores" | awk -F',' '{
    prod = 1.0
    for (i = 1; i <= NF; i++) { prod *= (1.0 - $i) }
    printf "%.4f", 1.0 - prod
  }'
}

# ── Entity Operations ──────────────────────────────────────

# osint_entity_add <type> <value> [key=val ...] [--tool X] [--confidence N] [--investigation ID]
# Returns: entity ID (prints to stdout)
osint_entity_add() {
  osint_graph_init
  local etype="$1" evalue="$2"
  shift 2
  local tool="manual" confidence="" investigation="" now
  now=$(_graph_now)
  local props="{}"

  while [ $# -gt 0 ]; do
    case "$1" in
    --tool)
      tool="$2"
      shift 2
      ;;
    --confidence)
      confidence="$2"
      shift 2
      ;;
    --investigation)
      investigation="$2"
      shift 2
      ;;
    *=*)
      props=$(echo "$props" | jq --arg k "${1%%=*}" --arg v "${1#*=}" '. + {($k): $v}')
      shift
      ;;
    *) shift ;;
    esac
  done

  [ -z "$confidence" ] && confidence=$(_source_weight "$tool")

  # Check for existing entity (dedup by type + normalized value)
  local norm_value
  norm_value=$(echo "$evalue" | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]*$//')
  local existing_id
  existing_id=$(jq -r --arg t "$etype" --arg v "$norm_value" \
    '.[] | select(.type == $t and (.value | ascii_downcase) == $v) | .id' \
    "$OSINT_GRAPH_DIR/entities.json" 2>/dev/null | head -1)

  if [ -n "$existing_id" ] && [ "$existing_id" != "null" ]; then
    # Update existing: merge properties, add source, recalculate confidence
    local source_entry
    source_entry=$(jq -n --arg t "$tool" --arg inv "$investigation" --arg ts "$now" --argjson c "$confidence" \
      '{tool: $t, investigation: $inv, timestamp: $ts, confidence: $c}')

    jq --arg id "$existing_id" --argjson props "$props" --argjson src "$source_entry" --arg ts "$now" \
      '[.[] | if .id == $id then
        .properties = (.properties * $props) |
        .sources += [$src] |
        .last_seen = $ts
      else . end]' "$OSINT_GRAPH_DIR/entities.json" >"$OSINT_GRAPH_DIR/entities.json.tmp" &&
      mv -f "$OSINT_GRAPH_DIR/entities.json.tmp" "$OSINT_GRAPH_DIR/entities.json"

    # Recalculate fused confidence
    local all_scores
    all_scores=$(jq -r --arg id "$existing_id" \
      '.[] | select(.id == $id) | .sources | map(.confidence) | join(",")' \
      "$OSINT_GRAPH_DIR/entities.json")
    local fused
    fused=$(_fuse_confidence "$all_scores")

    jq --arg id "$existing_id" --argjson c "$fused" \
      '[.[] | if .id == $id then .confidence = $c else . end]' \
      "$OSINT_GRAPH_DIR/entities.json" >"$OSINT_GRAPH_DIR/entities.json.tmp" &&
      mv -f "$OSINT_GRAPH_DIR/entities.json.tmp" "$OSINT_GRAPH_DIR/entities.json"

    echo "$existing_id"
  else
    # Create new entity
    local eid
    eid="e-$(_graph_uuid)"
    local source_entry
    source_entry=$(jq -n --arg t "$tool" --arg inv "$investigation" --arg ts "$now" --argjson c "$confidence" \
      '{tool: $t, investigation: $inv, timestamp: $ts, confidence: $c}')

    jq --arg id "$eid" --arg t "$etype" --arg v "$evalue" --argjson props "$props" \
      --argjson c "$confidence" --argjson src "$source_entry" --arg ts "$now" \
      '. += [{id: $id, type: $t, value: $v, properties: $props, confidence: $c,
              sources: [$src], first_seen: $ts, last_seen: $ts}]' \
      "$OSINT_GRAPH_DIR/entities.json" >"$OSINT_GRAPH_DIR/entities.json.tmp" &&
      mv -f "$OSINT_GRAPH_DIR/entities.json.tmp" "$OSINT_GRAPH_DIR/entities.json"

    echo "$eid"
  fi
}

# osint_entity_find <type> <value>
# Returns: entity JSON or empty
osint_entity_find() {
  osint_graph_init
  local etype="$1" evalue="$2"
  local norm_value
  norm_value=$(echo "$evalue" | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]*$//')
  jq --arg t "$etype" --arg v "$norm_value" \
    '.[] | select(.type == $t and (.value | ascii_downcase) == $v)' \
    "$OSINT_GRAPH_DIR/entities.json" 2>/dev/null
}

# osint_entity_search <query>
# Fuzzy search across all entity values and properties
osint_entity_search() {
  osint_graph_init
  local query="$1"
  local norm_q
  norm_q=$(echo "$query" | tr '[:upper:]' '[:lower:]')
  jq --arg q "$norm_q" \
    '[.[] | select((.value | ascii_downcase | test($q)) or (.properties | tostring | ascii_downcase | test($q)))]' \
    "$OSINT_GRAPH_DIR/entities.json" 2>/dev/null
}

# osint_entity_get <entity_id>
osint_entity_get() {
  jq --arg id "$1" '.[] | select(.id == $id)' "$OSINT_GRAPH_DIR/entities.json" 2>/dev/null
}

# ── Relationship Operations ────────────────────────────────

# osint_rel_add <from_id> <to_id> <type> [--tool X] [--confidence N] [--investigation ID]
# Returns: relationship ID
osint_rel_add() {
  osint_graph_init
  local from_id="$1" to_id="$2" rtype="$3"
  shift 3
  local tool="manual" confidence="" investigation="" now
  now=$(_graph_now)

  while [ $# -gt 0 ]; do
    case "$1" in
    --tool)
      tool="$2"
      shift 2
      ;;
    --confidence)
      confidence="$2"
      shift 2
      ;;
    --investigation)
      investigation="$2"
      shift 2
      ;;
    *) shift ;;
    esac
  done

  [ -z "$confidence" ] && confidence=$(_source_weight "$tool")

  # Check for existing relationship (dedup)
  local existing_id
  existing_id=$(jq -r --arg f "$from_id" --arg t "$to_id" --arg rt "$rtype" \
    '.[] | select(.from == $f and .to == $t and .type == $rt) | .id' \
    "$OSINT_GRAPH_DIR/relationships.json" 2>/dev/null | head -1)

  if [ -n "$existing_id" ] && [ "$existing_id" != "null" ]; then
    # Update existing: add source, recalculate confidence
    local source_entry
    source_entry=$(jq -n --arg t "$tool" --arg inv "$investigation" --arg ts "$now" --argjson c "$confidence" \
      '{tool: $t, investigation: $inv, timestamp: $ts, confidence: $c}')

    jq --arg id "$existing_id" --argjson src "$source_entry" --arg ts "$now" \
      '[.[] | if .id == $id then .sources += [$src] | .last_seen = $ts else . end]' \
      "$OSINT_GRAPH_DIR/relationships.json" >"$OSINT_GRAPH_DIR/relationships.json.tmp" &&
      mv -f "$OSINT_GRAPH_DIR/relationships.json.tmp" "$OSINT_GRAPH_DIR/relationships.json"

    echo "$existing_id"
  else
    local rid
    rid="r-$(_graph_uuid)"
    local source_entry
    source_entry=$(jq -n --arg t "$tool" --arg inv "$investigation" --arg ts "$now" --argjson c "$confidence" \
      '{tool: $t, investigation: $inv, timestamp: $ts, confidence: $c}')

    jq --arg id "$rid" --arg f "$from_id" --arg t "$to_id" --arg rt "$rtype" \
      --argjson c "$confidence" --argjson src "$source_entry" --arg ts "$now" \
      '. += [{id: $id, from: $f, to: $t, type: $rt, confidence: $c,
              sources: [$src], first_seen: $ts, last_seen: $ts}]' \
      "$OSINT_GRAPH_DIR/relationships.json" >"$OSINT_GRAPH_DIR/relationships.json.tmp" &&
      mv -f "$OSINT_GRAPH_DIR/relationships.json.tmp" "$OSINT_GRAPH_DIR/relationships.json"

    echo "$rid"
  fi
}

# osint_rel_find <entity_id>
# Returns all relationships involving this entity (as from or to)
osint_rel_find() {
  local eid="$1"
  jq --arg id "$eid" '[.[] | select(.from == $id or .to == $id)]' \
    "$OSINT_GRAPH_DIR/relationships.json" 2>/dev/null
}

# ── Graph Traversal ─────────────────────────────────────────

# osint_graph_query <entity_id> [max_depth]
# BFS traversal from an entity, returns all reachable entities within N hops
osint_graph_query() {
  # BFS traversal from entity, returns JSON array of reachable entities
  local _start="$1" _max="${2:-2}"

  # Use Python for reliable BFS (zsh word splitting is unreliable)
  python3 -c "
import json, sys
with open('$OSINT_GRAPH_DIR/entities.json') as f: entities = json.load(f)
with open('$OSINT_GRAPH_DIR/relationships.json') as f: rels = json.load(f)

visited = {'$_start'}
frontier = {'$_start'}
for depth in range($_max):
    next_frontier = set()
    for eid in frontier:
        for r in rels:
            if r['from'] == eid and r['to'] not in visited:
                visited.add(r['to']); next_frontier.add(r['to'])
            elif r['to'] == eid and r['from'] not in visited:
                visited.add(r['from']); next_frontier.add(r['from'])
    frontier = next_frontier
    if not frontier: break

result = [e for e in entities if e['id'] in visited]
print(json.dumps(result, indent=2))
"
}

# ── Reporting ───────────────────────────────────────────────

# osint_graph_report
# Generate markdown report from the current graph
osint_graph_report() {
  osint_graph_init
  local entity_count rel_count
  entity_count=$(jq 'length' "$OSINT_GRAPH_DIR/entities.json")
  rel_count=$(jq 'length' "$OSINT_GRAPH_DIR/relationships.json")

  echo "# OSINT Investigation Report (Graph-Based)"
  echo ""
  echo "> Generated: $(_graph_now)"
  echo "> Entities: $entity_count | Relationships: $rel_count"
  echo ""

  # Entities by type
  for etype in person company domain ip email username phone hash; do
    local _rpt_count
    _rpt_count=$(jq --arg t "$etype" '[.[] | select(.type == $t)] | length' "$OSINT_GRAPH_DIR/entities.json")
    if [ "$_rpt_count" -gt 0 ]; then
      echo "## $(echo "$etype" | awk '{print toupper(substr($0,1,1)) substr($0,2)}') Entities ($_rpt_count)"
      echo ""
      echo "| Value | Confidence | Sources | Properties |"
      echo "|-------|-----------|---------|------------|"
      jq -r --arg t "$etype" '.[] | select(.type == $t) |
        "| \(.value) | \(.confidence) | \(.sources | length) | \(.properties | tostring | .[0:60]) |"' \
        "$OSINT_GRAPH_DIR/entities.json"
      echo ""
    fi
  done

  # Relationships
  if [ "$rel_count" -gt 0 ]; then
    echo "## Relationships ($rel_count)"
    echo ""
    echo "| From | Type | To | Confidence |"
    echo "|------|------|-----|-----------|"
    jq -r '.[] | "| \(.from) | \(.type) | \(.to) | \(.confidence) |"' \
      "$OSINT_GRAPH_DIR/relationships.json"
    echo ""
  fi

  # High-confidence findings
  echo "## High-Confidence Findings (>0.85)"
  echo ""
  jq -r '.[] | select(.confidence > 0.85) | "- **\(.type)**: \(.value) (confidence: \(.confidence), sources: \(.sources | length))"' \
    "$OSINT_GRAPH_DIR/entities.json"
  echo ""
}

# ── Stats & Export ──────────────────────────────────────────

osint_graph_stats() {
  osint_graph_init
  local e_count r_count
  e_count=$(jq 'length' "$OSINT_GRAPH_DIR/entities.json")
  r_count=$(jq 'length' "$OSINT_GRAPH_DIR/relationships.json")

  echo "Graph: $OSINT_GRAPH_DIR"
  echo "Entities: $e_count"
  echo "Relationships: $r_count"

  echo "By type:"
  jq -r 'group_by(.type) | .[] | "  \(.[0].type): \(length)"' "$OSINT_GRAPH_DIR/entities.json"

  echo "Relationship types:"
  jq -r 'group_by(.type) | .[] | "  \(.[0].type): \(length)"' "$OSINT_GRAPH_DIR/relationships.json"
}

osint_graph_export_json() {
  jq -n --slurpfile e "$OSINT_GRAPH_DIR/entities.json" \
    --slurpfile r "$OSINT_GRAPH_DIR/relationships.json" \
    '{entities: $e[0], relationships: $r[0]}'
}

# osint_graph_reset — clear all data (use with caution)
osint_graph_reset() {
  osint_graph_init
  echo '[]' >"$OSINT_GRAPH_DIR/entities.json"
  echo '[]' >"$OSINT_GRAPH_DIR/relationships.json"
  echo "Graph reset."
}
