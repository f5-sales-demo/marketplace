# Workflow: Register Customer Edge Site

Register and configure a CE site

Complexity: high. Steps: 6.

## Prerequisites

- Site hardware or VM provisioned
- Network connectivity to F5 XC
- Registration token generated

## Steps

### Step 1: Generate Registration Token

Create site registration token

Resource: `site_token` (profile: `resources/sites/site_token.md`)

### Step 2: Configure Site Settings

Define site parameters

Resource: `site` (profile: `resources/sites/site.md`)

Required fields: `name`, `site_type`

### Step 3: Install CE Software

Deploy F5 XC software on site

Depends on: steps 1

### Step 4: Complete Registration

Finalize site registration

Depends on: steps 2, 3

### Step 5: Configure Site Network

Set up site networking

Depends on: steps 4

### Step 6: Verify Site Status

Confirm site is operational

Verification:

- Site shows online status
- Tunnel connectivity established
- Services deployed successfully
