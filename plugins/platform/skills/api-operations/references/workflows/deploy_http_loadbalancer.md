# Workflow: Deploy HTTP Load Balancer

Create a fully configured HTTP load balancer with backend origin pool

Complexity: medium. Steps: 5.

## Prerequisites

- Valid namespace in target tenant
- Backend application reachable via IP or DNS
- SSL certificate (optional for HTTPS)

## Steps

### Step 1: Create Origin Pool

Define backend servers for the load balancer

Resource: `origin_pool` (profile: `resources/virtual/origin_pool.md`)

Required fields: `name`, `origin_servers`, `port`

Tips:

- Use private IPs for internal applications
- Configure health checks for high availability

### Step 2: Configure Health Check (optional)

Set up health monitoring for origin pool

Resource: `healthcheck` (profile: `resources/virtual/healthcheck.md`)

Required fields: `name`, `http_health_check`

Tips:

- Use application-specific health endpoints
- Set appropriate timeout values

### Step 3: Attach Health Check (optional)

Link health check to origin pool

Depends on: steps 1, 2

### Step 4: Create HTTP Load Balancer

Configure the load balancer with origin pool

Resource: `http_loadbalancer` (profile: `resources/virtual/http_loadbalancer.md`)

Depends on: steps 1

Required fields: `name`, `domains`, `http.port`

Tips:

- Use wildcard domains for multi-host routing
- Configure advertise policy for internet exposure

### Step 5: Verify Deployment

Test load balancer endpoint accessibility

Depends on: steps 4

Verification:

- DNS resolution for configured domains
- HTTP response from load balancer VIP
- Backend origin health status
