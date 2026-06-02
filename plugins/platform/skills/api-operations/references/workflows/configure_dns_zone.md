# Workflow: Configure DNS Zone

Set up authoritative DNS zone with records

Complexity: low. Steps: 4.

## Prerequisites

- Domain name ownership
- NS delegation configured at registrar

## Steps

### Step 1: Create DNS Zone

Create authoritative zone for domain

Resource: `dns_zone` (profile: `resources/dns/dns_zone.md`)

Required fields: `name`, `domain`

### Step 2: Add DNS Records

Create A, CNAME, and other records

Resource: `dns_record` (profile: `resources/dns/dns_record.md`)

Depends on: steps 1

Tips:

- Use appropriate TTL values
- Add MX records for email

### Step 3: Enable DNSSEC (optional)

Configure DNS security extensions

Depends on: steps 1

### Step 4: Verify DNS Resolution

Test DNS queries

Verification:

- Query records from public DNS
- Verify propagation
