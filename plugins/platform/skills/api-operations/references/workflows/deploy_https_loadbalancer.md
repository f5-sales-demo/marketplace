# Workflow: Deploy HTTPS Load Balancer with TLS

Create HTTPS load balancer with SSL/TLS termination

Complexity: high. Steps: 7.

## Prerequisites

- Valid namespace in target tenant
- SSL certificate and private key
- Backend application reachable

## Steps

### Step 1: Upload SSL Certificate

Upload certificate and private key

Resource: `certificate` (profile: `resources/virtual/certificate.md`)

Required fields: `name`, `certificate_chain`, `private_key`

Tips:

- Include intermediate certificates in chain
- Use PEM format for certificate data

### Step 2: Create Origin Pool

Define backend servers

Resource: `origin_pool` (profile: `resources/virtual/origin_pool.md`)

Required fields: `name`, `origin_servers`

### Step 3: Configure Health Check (optional)

Set up health monitoring

Resource: `healthcheck` (profile: `resources/virtual/healthcheck.md`)

### Step 4: Configure WAF Policy (optional)

Enable web application firewall

Resource: `app_firewall` (profile: `resources/virtual/app_firewall.md`)

Tips:

- Start in monitoring mode
- Use appropriate rule sets

### Step 5: Create HTTPS Load Balancer

Configure load balancer with TLS

Resource: `http_loadbalancer` (profile: `resources/virtual/http_loadbalancer.md`)

Depends on: steps 1, 2

Required fields: `name`, `domains`, `https.tls_parameters`

### Step 6: Attach WAF Policy (optional)

Link WAF to load balancer

Depends on: steps 4, 5

### Step 7: Verify HTTPS Deployment

Test secure endpoint

Verification:

- TLS certificate validation
- HTTPS response codes
- WAF policy application
