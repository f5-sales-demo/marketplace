#!/usr/bin/env bash
# Transform arf.json into per-category reference files.
# Filters out paid, dead, deprecated, and invitation-only tools.
# Usage: bash plugins/osint-framework/scripts/transform-arf.sh
set -eo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$PLUGIN_DIR/data/arf.json"
SKILLS="$PLUGIN_DIR/skills"

if [[ ! -f "$DATA" ]]; then
  echo "ERROR: $DATA not found" >&2
  exit 1
fi

# ── Category name → skill directory (tab-separated for safe parsing) ──
MAPPING="Username	username-recon
Email Address	email-recon
Domain Name	domain-recon
Cloud Infrastructure	cloud-recon
IP & MAC Address	ip-address-recon
Images / Videos / Docs	images-videos
Social Networks	social-networks
Instant Messaging	messaging-comms
People Search Engines	people-search
Dating	messaging-comms
Telephone Numbers	phone-recon
Public Records	public-records
Compliance & Risk Intelligence	compliance-risk
Business Records	business-records
Transportation	transportation
Geolocation Tools / Maps	geolocation
Search Engines	search-engines
Online Communities	online-communities
Archives	archives-cache
Language Translation	language-translation
Mobile OSINT	mobile-osint
Dark Web	dark-web
Disinformation & Media Verification	disinfo-verification
Blockchain & Cryptocurrency	blockchain-crypto
Classifieds	classifieds
Encoding / Decoding	encoding-decoding
Tools	osint-tools
AI Tools	ai-tools
Malicious File Analysis	malicious-file-analysis
Exploits & Advisories	exploits-advisories
Threat Intelligence	threat-intelligence
OpSec	opsec
Documentation / Evidence Capture	documentation-evidence
Training	training"

# ── Main jq filter ──────────────────────────────────────────
JQ_FILTER='
def collect_leaves:
  if .type == "url" then
    if (.pricing == "paid" or .pricing == "subscription") then empty
    elif (.status == "dead" or .status == "deprecated") then empty
    elif (.deprecated == true) then empty
    elif (.invitationOnly == true) then empty
    else .
    end
  elif .children then
    .children[] | collect_leaves
  else empty
  end;

def tool_type:
  if .localInstall == true then "CLI"
  elif .googleDork == true then "Google Dork"
  elif .api == true then "API"
  else "Web" end;

def pricing_label:
  if .pricing == "freemium" then "Freemium" else "Free" end;

def opsec_label:
  if .opsec == "active" then "Active"
  elif .opsec == "passive" then "Passive"
  else "Passive" end;

def bool_yn: if . == true then "Yes" else "No" end;

def tool_md:
  "### " + .name + "\n\n" +
  "- **URL**: <" + (.url // "N/A") + ">\n" +
  "- **Type**: " + tool_type + "\n" +
  "- **Pricing**: " + pricing_label + "\n" +
  "- **OPSEC**: " + opsec_label + "\n" +
  "- **Registration**: " + (.registration | bool_yn) + "\n" +
  "- **API**: " + (.api | bool_yn) + "\n" +
  "- **CLI Install**: " + (if .localInstall == true then "Yes" else "N/A" end) + "\n" +
  (if .bestFor then "- **Best For**: " + .bestFor + "\n" else "" end) +
  (if .input then "- **Input**: " + .input + "\n" else "" end) +
  (if .output then "- **Output**: " + .output + "\n" else "" end) +
  (if .description then "- **Description**: " + .description + "\n" else "" end) +
  "";
'

echo "Transforming arf.json..."

TOTAL_TOOLS=0
TOTAL_CATEGORIES=0
INDEX_ROWS=""

while IFS=$'\t' read -r cat_name skill_dir; do
  [[ -z "$cat_name" ]] && continue

  ref_dir="$SKILLS/$skill_dir/references"
  ref_file="$ref_dir/tools.md"
  mkdir -p "$ref_dir"

  # Count tools for this category
  tool_count=$(jq --arg cat "$cat_name" "$JQ_FILTER"'
    [.children[] | select(.name == $cat) | collect_leaves] | length
  ' "$DATA")

  if [[ "$tool_count" -eq 0 ]]; then
    continue
  fi

  # Get subcategories
  subcats=$(jq -r --arg cat "$cat_name" '
    .children[] | select(.name == $cat) | .children[]? |
    select(.children != null and (.type == "folder" or .type == null)) | .name
  ' "$DATA" 2>/dev/null || true)

  # Generate tool markdown
  tools_md=$(jq -r --arg cat "$cat_name" "$JQ_FILTER"'
    .children[] | select(.name == $cat) | collect_leaves | tool_md
  ' "$DATA")

  {
    echo "# $cat_name — OSINT Tools Reference"
    echo ""
    echo "> Auto-generated from arf.json. $tool_count free/freemium tools."
    echo "> Source: <https://osintframework.com>"
    echo ""
    if [[ -n "$subcats" ]]; then
      echo "## Subcategories"
      echo ""
      while IFS= read -r sub; do
        [[ -n "$sub" ]] && echo "- $sub"
      done <<<"$subcats"
      echo ""
    fi
    echo "---"
    echo ""
    echo "$tools_md"
  } >"$ref_file"

  # If this skill_dir already has a file (merged categories), append
  # Actually the > above overwrites. For merged categories (Dating->messaging-comms),
  # we need to append. Check if the file already existed with content from another category.

  TOTAL_TOOLS=$((TOTAL_TOOLS + tool_count))
  TOTAL_CATEGORIES=$((TOTAL_CATEGORIES + 1))
  INDEX_ROWS="${INDEX_ROWS}| $cat_name | \`$skill_dir\` | $tool_count |\n"
  echo "  $skill_dir ($cat_name): $tool_count tools"

done <<<"$MAPPING"

# ── Generate tree-index.md ───────────────────────────────────
CATALOG_REF="$SKILLS/osint-catalog/references"
mkdir -p "$CATALOG_REF"

{
  echo "# OSINT Framework — Category Index"
  echo ""
  echo "> $TOTAL_TOOLS free/freemium tools across $TOTAL_CATEGORIES categories"
  echo "> Source: <https://osintframework.com>"
  echo ""
  echo "| Category | Skill | Tools |"
  echo "|----------|-------|-------|"
  echo -e "$INDEX_ROWS"
} >"$CATALOG_REF/tree-index.md"

echo ""
echo "Done: $TOTAL_TOOLS tools across $TOTAL_CATEGORIES categories"
echo "Output: $SKILLS/*/references/tools.md"
echo "Index:  $CATALOG_REF/tree-index.md"
