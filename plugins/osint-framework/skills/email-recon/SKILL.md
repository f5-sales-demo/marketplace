---
name: email-recon
description: >-
  Email address reconnaissance — search, verify, discover breach data,
  and find associated accounts for email addresses. Use when the user
  wants to verify an email, find who owns an email, check breach
  exposure, discover email formats, or find associated accounts.
  Activates for "email lookup", "verify email", "breach check",
  "find email for", "email search", "email format", "who owns this email".
user-invocable: false
---

# Email Reconnaissance

Search, verify, and investigate email addresses — breach exposure,
account discovery, format generation, and ownership identification.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/email-recon/references/tools.md` for the complete
list of 28 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| theHarvester | `pip install theHarvester` | `theHarvester -d domain.com -b all` |
| holehe | `pip install holehe` | `holehe history-97817c0c4999@example.com` |
| h8mail | `pip install h8mail` | `h8mail -t history-97817c0c4999@example.com` |
| Infoga | `git clone https://github.com/m4ll0k/infoga` | `python infoga.py -t history-97817c0c4999@example.com` |

## Subcategories

- **Email Search** — Find email addresses for a person or domain
- **Common Email Formats** — Generate likely email patterns
- **Email Verification** — Check if an email exists and is deliverable
- **Breach Data** — Check if an email appears in known data breaches
- **Mail Blacklists** — Check if an email/domain is blacklisted

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Email tool search",
  prompt="Find OSINT tools for email reconnaissance.\n
    Read skills/email-recon/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Email investigation: [target]",
  prompt="Investigate email: [target]\n\n
    Primary: Read skills/email-recon/references/tools.md\n
    Secondary: Read skills/username-recon/references/tools.md\n
    Execute available CLI tools, check breach databases, report findings."
)
```

## Investigation Workflow

1. **Verify**: Confirm the email is valid and deliverable
2. **Breach check**: Search breach databases (Have I Been Pwned, etc.)
3. **Account discovery**: Use holehe to find associated accounts
4. **Username pivot**: Extract username portion, run `username-recon`
5. **Domain pivot**: Investigate the domain with `domain-recon`

## Executable Pipelines

For copy-paste-ready command sequences with output parsing, see:
`skills/osint-catalog/references/investigation-pipelines.md` — Section 2: Email Investigation Pipeline

Quick one-liner:

```bash
holehe TARGET --no-color 2>/dev/null | grep '^\[+\]'
```
