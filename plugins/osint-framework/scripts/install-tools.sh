#!/usr/bin/env bash
# Install verified OSINT CLI tools into the devcontainer.
# Generated from data/cli-tools.json manifest.
# Skips tools already present in the f5xc-devcontainer base image.
# Usage: bash plugins/osint-framework/scripts/install-tools.sh [--pip-only|--go-only|--apt-only|--all]
set -eo pipefail

MODE="${1:---all}"
INSTALLED=0
FAILED=0
SKIPPED=0

log() { echo "[OSINT] $1"; }
ok() {
  log "  OK:   $1"
  INSTALLED=$((INSTALLED + 1))
}
fail() {
  log "  FAIL: $1 — $2"
  FAILED=$((FAILED + 1))
}
skip() {
  log "  SKIP: $1 (already installed)"
  SKIPPED=$((SKIPPED + 1))
}

# ── APT packages (NEW — not in base image) ─────────────────
# Base image already has: nmap, masscan, tshark, wireshark, exiftool,
#   tor, sqlmap, dirb, nikto, hydra, john, hashcat, radare2, binwalk,
#   foremost, whois, dnsutils, ruby, ruby-dev
install_apt() {
  log "=== APT packages (OSINT additions) ==="

  local packages=(
    exiv2         # EXIF/IPTC/XMP metadata read/write
    mediainfo     # Media file codec/bitrate metadata
    autopsy       # Digital forensics platform
    mono-complete # Mono runtime (for NetworkMiner)
    i2p           # I2P anonymous network daemon
  )

  log "Installing ${#packages[@]} apt packages..."
  sudo apt-get update -qq
  for pkg in "${packages[@]}"; do
    if dpkg -l "$pkg" >/dev/null 2>&1; then
      skip "$pkg"
    else
      if sudo apt-get install -y -qq "$pkg" 2>/dev/null; then ok "$pkg"; else fail "$pkg" "apt install failed"; fi
    fi
  done
}

# ── PIP packages (NEW — verified on PyPI, not in base) ─────
# Base image already has: theHarvester, checkov, prowler, yt-dlp
install_pip() {
  log "=== PIP packages (26 new verified tools) ==="

  local packages=(
    # Username & Email Recon
    sherlock-project # Username enumeration across 400+ sites
    maigret          # Username enumeration across 3000+ sites
    holehe           # Email-to-account discovery
    h8mail           # Email breach checking
    sylva            # Username and identity discovery

    # Domain & Network Recon
    dnsrecon  # DNS enumeration and zone transfer
    sublist3r # Subdomain enumeration
    scanless  # Port scanning through online services

    # Cloud Security
    scoutsuite # Multi-cloud security auditing
    c7n        # Cloud Custodian policy engine
    roadrecon  # Azure AD reconnaissance

    # Threat Intelligence
    iocextract # IOC extraction from text
    ioc_parser # IOC parsing from reports
    pymisp     # MISP threat sharing platform client

    # Malware & File Analysis
    oletools  # Microsoft Office malware analysis
    pdfid     # PDF structure analysis
    quicksand # Document malware analysis framework

    # Mobile & App Analysis
    apkleaks    # APK secret/endpoint scanner
    frida-tools # Runtime instrumentation toolkit

    # Social & Messaging
    masto       # Mastodon OSINT
    wechatsogou # WeChat public account search
    linelog2py  # LINE chat log parser
    xeuledoc    # Google document metadata extraction

    # Media & Archives
    waybackpack # Wayback Machine bulk downloader
    dfir-unfurl # URL/timestamp artifact analysis

    # Dark Web
    torbot # Dark web crawler
  )

  log "Installing ${#packages[@]} pip packages..."
  pip3 install --quiet --break-system-packages "${packages[@]}" 2>&1 | tail -5
  ok "pip batch (${#packages[@]} packages)"
}

# ── GO packages (NEW — not in base image) ──────────────────
# Base image already has: subfinder, httpx, dnsx, amass, gitleaks,
#   nuclei, gau, ffuf, gobuster, feroxbuster, dalfox, trufflehog, grype, syft
install_go() {
  log "=== GO packages (3 new verified tools) ==="

  local -A tools=(
    ["checkip"]="github.com/jreisinger/checkip@latest"
    ["goblob"]="github.com/Macmod/goblob@latest"
    ["bucketloot"]="github.com/redhuntlabs/bucketloot/cmd/bucketloot@latest"
  )

  for name in "${!tools[@]}"; do
    if command -v "$name" >/dev/null 2>&1; then
      skip "$name"
    else
      local pkg="${tools[$name]}"
      log "  Installing $name..."
      if go install "$pkg" 2>&1; then
        ok "$name"
      else
        fail "$name" "go install failed"
      fi
    fi
  done
}

# ── GEM packages ────────────────────────────────────────────
install_gem() {
  log "=== GEM packages ==="
  if gem install origami --no-document 2>/dev/null; then ok "origami (PDF framework)"; else fail "origami" "gem install failed"; fi
}

# ── NPM packages ───────────────────────────────────────────
install_npm() {
  log "=== NPM packages ==="
  if npm install -g js-deobfuscator 2>/dev/null; then ok "js-deobfuscator"; else fail "js-deobfuscator" "npm install failed"; fi
}

# ── Verify installed tools ─────────────────────────────────
verify() {
  log "=== Verification ==="
  local pass=0
  local total=0

  for cmd in sherlock maigret holehe h8mail dnsrecon sublist3r scanless \
    iocextract oletools apkleaks frida waybackpack torbot \
    checkip goblob bucketloot exiv2 mediainfo; do
    total=$((total + 1))
    if command -v "$cmd" >/dev/null 2>&1; then
      pass=$((pass + 1))
    else
      # Check pip as fallback
      if pip3 show "$cmd" >/dev/null 2>&1; then
        pass=$((pass + 1))
      else
        log "  NOT FOUND: $cmd"
      fi
    fi
  done

  log "Verified: $pass/$total tools available"
}

# ── Summary ─────────────────────────────────────────────────
summary() {
  echo ""
  log "======================================="
  log "OSINT Tool Installation Summary"
  log "======================================="
  log "Installed: $INSTALLED"
  log "Failed:    $FAILED"
  log "Skipped:   $SKIPPED (already in base image)"
  log "======================================="
}

# ── Main ────────────────────────────────────────────────────
case "$MODE" in
--pip-only)
  install_pip
  summary
  ;;
--go-only)
  install_go
  summary
  ;;
--apt-only)
  install_apt
  summary
  ;;
--gem-only)
  install_gem
  summary
  ;;
--npm-only)
  install_npm
  summary
  ;;
--verify) verify ;;
--all)
  install_apt
  install_pip
  install_go
  install_gem
  install_npm
  verify
  summary
  ;;
*)
  echo "Usage: $0 [--pip-only|--go-only|--apt-only|--gem-only|--npm-only|--verify|--all]"
  exit 1
  ;;
esac
