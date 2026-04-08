---
description: Run an OSINT investigation against a target
argument-hint: "<target>"
---

# /osint-investigate

Run an OSINT investigation against a target using available command-line tools
and web resources.

## Target Auto-Detection

Automatically detect the target type:

- **Email**: contains `@` and `.`
- **Domain**: looks like `example.com`
- **IP**: matches IP address pattern
- **Phone**: starts with `+` or 7+ digits
- **Username**: single word or starts with `@`
- **Hash**: 32/40/64 hex characters

## Delegation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="OSINT investigation: [target]",
  prompt="Investigate target: [args]\n\n
    1. Auto-detect target type\n
    2. Read the primary category reference file for that target type\n
    3. Check which CLI tools are installed\n
    4. Execute available tools (passive first, then active)\n
    5. Return structured investigation report"
)
```

## Legal Notice

All investigations use publicly available information only.
Users are responsible for compliance with applicable laws.
