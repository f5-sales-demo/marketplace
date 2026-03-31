---
name: username-recon
description: >-
  Username reconnaissance — enumerate accounts across platforms,
  discover linked profiles, and correlate digital identities.
  Use when the user wants to find accounts for a username, check
  if a username exists, search for social media profiles, or
  enumerate platforms for a handle. Activates for "find accounts",
  "username lookup", "who uses this handle", "check username",
  "search username", "enumerate accounts", "find profiles for".
user-invocable: false
---

# Username Reconnaissance

Find and enumerate accounts associated with a username or handle
across hundreds of platforms.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/username-recon/references/tools.md` for the complete
list of 18 free tools in this category.

## Key CLI Tools

| Tool | Install | Usage |
|------|---------|-------|
| Sherlock | `pip install sherlock-project` | `sherlock <username>` |
| Maigret | `pip install maigret` | `maigret <username>` |
| WhatsMyName | `git clone https://github.com/WebBreacher/WhatsMyName` | Web or CLI |
| Sylva | `pip install sylva` | `sylva <username>` |

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Username tool search",
  prompt="Find OSINT tools for username reconnaissance.\n
    Read skills/username-recon/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Username investigation: [target]",
  prompt="Investigate username: [target]\n\n
    Primary: Read skills/username-recon/references/tools.md\n
    Secondary: Read skills/social-networks/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    OPSEC: Most username enumeration tools are ACTIVE — they make
    requests to target platforms."
)
```

## OPSEC Warning

Username enumeration tools are **active** reconnaissance — they make
direct HTTP requests to target platforms to check for account existence.
This may be logged by the target platforms.

## Investigation Workflow

1. **Start with CLI tools**: Run Sherlock or Maigret for broad enumeration
2. **Cross-reference**: Check discovered profiles against each other
3. **Expand**: Use discovered email addresses with `email-recon`
4. **Profile**: Use `social-networks` skills for platform-specific deep dives

## Executable Pipelines

For copy-paste-ready command sequences with output parsing, see:
`skills/osint-catalog/references/investigation-pipelines.md` — Section 1: Username Investigation Pipeline

Quick one-liner:
```bash
sherlock TARGET --print-found --no-color 2>/dev/null | grep -oP 'https?://\S+' | sort -u
```
