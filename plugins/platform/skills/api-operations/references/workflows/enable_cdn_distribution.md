# Workflow: Enable CDN Distribution

Configure CDN for content delivery

Complexity: medium. Steps: 5.

## Prerequisites

- Existing origin server or load balancer
- Content cacheable via HTTP headers

## Steps

### Step 1: Define Origin

Configure origin server for CDN

Resource: `cdn_origin` (profile: `resources/cdn/cdn_origin.md`)

Required fields: `name`, `origin_address`

### Step 2: Configure Cache Rules

Define caching behavior per content type

Tips:

- Set longer TTL for static assets
- Use vary headers appropriately

### Step 3: Create Distribution

Configure CDN distribution

Resource: `cdn_distribution` (profile: `resources/cdn/cdn_distribution.md`)

Depends on: steps 1

### Step 4: Configure SSL (optional)

Set up HTTPS for CDN endpoints

### Step 5: Verify Caching

Test CDN cache behavior

Verification:

- Check X-Cache headers
- Verify content delivery from edge
