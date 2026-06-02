# Workflow: Configure Origin Pool

Set up backend server pool with health checks

Complexity: low. Steps: 3.

## Prerequisites

- Backend server addresses
- Network connectivity to origins

## Steps

### Step 1: Create Origin Pool

Define backend servers

Resource: `origin_pool` (profile: `resources/origin_pool/origin_pool.md`)

Required fields: `name`, `origin_servers`, `port`

### Step 2: Add Health Check (optional)

Configure health monitoring

Resource: `healthcheck` (profile: `resources/origin_pool/healthcheck.md`)

### Step 3: Verify Connectivity

Test origin pool health

Verification:

- All origins showing healthy
- Connection pooling working
