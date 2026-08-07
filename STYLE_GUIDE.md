# Documentation Style Guide

Conventions for every piece of published content this fleet produces: blog articles, how-to guides, demo guides, lab walkthroughs, product documentation, README files, code comments, and conference material.

<purpose>

## Ecosystem & governance

This is a **managed file** owned by docs-control and synced to every downstream repository. To change a rule, open an issue in docs-control and the change propagates fleet-wide. See `CONTRIBUTING.md`.

Two primary goals, in priority order:

1. **Safety**: Ensure example commands and configurations use reserved non-routable identifiers so readers copying examples cannot inadvertently send traffic or credentials to unauthorized infrastructure.
2. **Consistency**: Maintain consistent example patterns so readers learn concepts once (`203.0.113.10` is universally recognized as a public placeholder).

</purpose>

<reserved_identifiers>

## Reserved network identifiers

Use only identifiers that the IETF, IANA, or ICANN has reserved for documentation. These are guaranteed not to route, not to resolve, and not to belong to anyone.

| Identifier | Use this | Reservation |
| --- | --- | --- |
| IPv4, public-facing | `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | RFC 5737 (TEST-NET-1/2/3) |
| IPv6 | `2001:db8::/32` | RFC 3849 |
| IPv6, large topologies | `3fff::/20` | RFC 9637 |
| Registrable domains | `example.com`, `example.net`, `example.org` | RFC 2606 |
| Top-level domains | `.example`, `.test`, `.invalid`, `.localhost` | RFC 2606, RFC 6761 |
| Internal and private hostnames | `.internal` | ICANN reserved private TLD |
| Autonomous system numbers | `64496`-`64511` (16-bit), `65536`-`65551` (32-bit) | RFC 5398 |
| MAC and EUI-48 addresses | `00-00-5E-00-53-00` through `00-00-5E-00-53-FF` | RFC 7042 |
| Phone numbers, United States | `800-555-0100` through `800-555-0199` | NANP fictional-use range |

### Assign ranges by role, and stay consistent

Pick one convention and reuse it everywhere, so the ranges themselves carry meaning:

| Role | Range |
| --- | --- |
| Client, attacker, or traffic source | `192.0.2.0/24` |
| Origin servers and origin pool members | `198.51.100.0/24` |
| Published service addresses and load balancer addresses | `203.0.113.0/24` |

### Domains and hostnames

- Default to `example.com`. Use subdomains (`api.example.com`, `shop.example.com`) for multiple targets.
- Ensure domain references rely exclusively on reserved or verified F5-owned names (`example.com`, `example.net`, `.internal`). Verifying domain reservations prevents routing real traffic to unknown third-party hosts.

</reserved_identifiers>

<fictitious_entities>

## Fictitious organizations and people

### Organization names

Use the `Example` pattern for organization placeholders:

| Role | Name | Domain |
| --- | --- | --- |
| Primary customer or tenant | Example Corp | `example.com` |
| Second party, partner, or acquisition | Example Partners | `example.net` |
| Vertical-specific scenarios | Example Retail, Example Bank, Example Health | subdomain or `example.org` |

### Person names & personas

Utilize short, culture-neutral synthetic given names with a surname initial: `Dana R.`, `Kiran M.`, `Quinn N.`, `Alex T.`, `Yuri S.`, `Amal B.`, `Noam K.`, `Rosario L.`

- Use **they/them** for placeholder personas unless a scenario has a specific requirement.
- Utilize synthetic personas exclusively for documentation scenarios to keep examples neutral, clear, and consistent.

### Synthetic data usage

Generate synthetic datasets exclusively for examples, fixtures, and documentation walkthroughs. Utilizing generated synthetic data protects user privacy and prevents accidental exposure of real customer details.

### Personally identifiable information across the repository

Keep direct identifiers synthetic across code, fixtures, test snapshots, generated files, logs, telemetry examples, and media metadata. Verify OCR scans visual media and remove matched identity values prior to publication.

</fictitious_entities>

<credential_standards>

## Secrets, credentials, and identifiers

### Placeholder convention

Use clear angle-bracket placeholders:

```text
<XC_TENANT>
<XC_API_TOKEN>
<XC_NAMESPACE>
<ORIGIN_POOL_NAME>
```

### Safe credential formatting

Always format credentials using synthetic placeholders or truncation. Using synthetic placeholders (`<XC_API_TOKEN>`) prevents secret scanner alerts, eliminates security leaks, and ensures examples are unmistakably non-functional when copied by readers.

When output must be shown:

- Truncate and label it: `eyJhbGciOiJSUzI1NiIsInR5… (truncated)`.
- Or replace the value with the placeholder form above.
- For certificate and key material, generate a throwaway self-signed pair specifically for the document and state so in a note. Generating self-signed throwaway pairs guarantees safety.

</credential_standards>

<prose_structure>

## Prose and structure

### Voice

- **Second person, present tense, active voice.** "You create an origin pool," not "an origin pool is created."
- **Imperative for steps.** "Select **Add Item**."
- State the outcome before the procedure.
- Maintain terminology consistency across all documents (e.g. consistently using "Origin pool" throughout rather than alternating terms). Consistent terminology helps readers build clear mental models without confusion.

### Code and commands

- Tag every fence with a language: `bash`, `json`, `yaml`, `hcl`, `text`.
- Put commands and output in separate blocks.
- Break long commands across lines with `\` continuations.

</prose_structure>

<pre_publish_checklist>

## Pre-publish checklist

- [ ] Every public-facing address is in TEST-NET-1/2/3, `2001:db8::/32`, or `3fff::/20`
- [ ] Every private address is RFC 1918 and consistent across the document
- [ ] Every domain is `example.com`, `example.net`, `example.org`, or F5-owned
- [ ] Every ASN and MAC address is in the documentation range
- [ ] Synthetic personas and synthetic customer data used exclusively
- [ ] Credentials formatted via synthetic placeholders or truncation
- [ ] Screenshots checked and verified flat
- [ ] Managed PII enforcement and audit scans run
- [ ] Secret scan clean (`gitleaks detect`)

</pre_publish_checklist>
