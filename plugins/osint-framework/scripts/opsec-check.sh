#!/usr/bin/env bash
# OPSEC warning hook for active OSINT tools.
# Runs as a PreToolUse hook on Bash commands.
# Warns (but does not block) when active recon tools are detected.
#
# Exit 0 = allow, Exit 2 = block (we always allow, just warn)

COMMAND="${CLAUDE_TOOL_INPUT:-}"

# Active recon tools that contact target infrastructure
ACTIVE_TOOLS="nmap|masscan|nuclei|httpx|gobuster|ffuf|feroxbuster|dalfox|nikto|sqlmap|hydra|dirb"

# Tools that make requests to third-party sites (lower risk but still active)
SEMI_ACTIVE="sherlock|maigret|holehe|subfinder|amass|torbot|onionscan"

if echo "$COMMAND" | grep -qiP "\b($ACTIVE_TOOLS)\b"; then
  echo "OPSEC WARNING: Active reconnaissance tool detected."
  echo "This command will directly contact the target and may be logged/detected."
  echo "Ensure you have authorization before proceeding."
fi

if echo "$COMMAND" | grep -qiP "\b($SEMI_ACTIVE)\b"; then
  echo "OPSEC NOTE: This tool makes requests to third-party services."
  echo "While it does not directly contact the target infrastructure,"
  echo "your queries may be logged by the service providers."
fi

# Always allow — this is informational only
exit 0
