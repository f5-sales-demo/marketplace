# Workflow: Enable WAF Protection

Add web application firewall to existing load balancer

Complexity: medium. Steps: 4.

## Prerequisites

- Existing HTTP load balancer
- Understanding of application traffic patterns

## Steps

### Step 1: Create Application Firewall

Define WAF policy with rule sets

Resource: `app_firewall` (profile: `resources/waf/app_firewall.md`)

Required fields: `name`, `blocking`

Tips:

- Start in monitoring mode for tuning
- Select rules based on application stack

### Step 2: Configure Exclusions (optional)

Add bypass rules for false positives

Tips:

- Exclude trusted internal IPs
- Add API endpoint exclusions if needed

### Step 3: Attach to Load Balancer

Apply WAF policy to load balancer

Depends on: steps 1

### Step 4: Monitor and Tune

Review WAF logs and adjust rules

Verification:

- Check security event logs
- Verify no legitimate traffic blocked
- Adjust rules as needed
