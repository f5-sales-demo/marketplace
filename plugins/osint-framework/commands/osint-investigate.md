---
description: Run an OSINT investigation against a target
argument-hint: "<target>"
---

# /osint-investigate

Run an OSINT investigation against a target using available command-line tools
and web resources.

## Evidence and reporting

Lead with the selected category, query or authorized target, the sources inspected, important
findings, warnings and stage completion. Label catalog-only discovery and recommendations;
record actual executed commands, results and conclusions separately. A listed tool or URL does
not prove installation, availability or a completed investigation.

Use the first twelve rows as the default list preview, with total and shown counts, readable
columns and an explicit continuation. Supply the complete safe evidence once when expanded or
requested. Keep counts separate from units, URLs and command text. Preserve zero, false, empty
strings, unknown values and literal corrective guidance; missing evidence is unknown rather than
an empty successful result. Identify unavailable, partial and failed sources and the exact next
action. Do not repeat the same evidence in both summary and expanded sections.

For executed operations, show the exact executable and argv with effective scope and flags.
Quote literal target values, and label install or usage examples as recommendations until run.
Retain existing authorization, write and OPSEC guards; catalog browsing does not start an
investigation, install software or contact external targets.

## Target Auto-Detection

Automatically detect the target type:

- **Email**: contains `@` and `.`
- **Domain**: looks like `example.com`
- **IP**: matches IP address pattern
- **Phone**: starts with `+` or 7+ digits
- **Username**: single word or starts with `@`
- **Hash**: 32/40/64 hex characters

## Delegation

```text
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
