# Salesforce Plugin

Container-adapted Salesforce CLI integration for Claude Code. Provides
org authentication, org management, and bridges to the official
[forcedotcom/afv-library](https://github.com/forcedotcom/afv-library)
skills for Salesforce development.

## Prerequisites

- **Salesforce CLI** (`@salesforce/cli`): `npm install -g @salesforce/cli`
- **afv-library skills**: `npx skills add forcedotcom/afv-library`
- **Salesforce org** with API access

## Quick Start

```bash
# Check CLI and org status
/sf-status

# Authenticate to an org
/sf-login my-dev-org
```

## Authentication Methods

This plugin adapts Salesforce authentication for headless container
environments:

| Method       | Best For                   | Command                     |
| ------------ | -------------------------- | --------------------------- |
| JWT Bearer   | CI/CD, automation          | `sf org login jwt`          |
| Access Token | Environment variable auth  | `sf org login access-token` |
| SFDX URL     | Portable auth URLs         | `sf org login sfdx-url`     |
| Web Login    | Interactive (VNC required) | `sf org login web`          |

**Note:** Device flow (`sf org login device`) is blocked since August
2025 and is not supported.

## Environment Variables

| Variable              | Purpose                            |
| --------------------- | ---------------------------------- |
| `SF_ACCESS_TOKEN`     | Bearer token for access-token auth |
| `SFDX_AUTH_URL`       | Force auth URL for sfdx-url auth   |
| `SF_ORG_INSTANCE_URL` | Org instance URL                   |
| `SF_JWT_KEY_FILE`     | Path to JWT private key            |
| `SF_CLIENT_ID`        | Connected App consumer key         |
| `SF_USERNAME`         | Salesforce username for JWT        |

## Skills

| Skill              | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `salesforce-index` | Routes requests to the right skill or agent |
| `salesforce-auth`  | Container-adapted org authentication        |

## Development Skills (via afv-library)

The 30 Salesforce development skills from `forcedotcom/afv-library` are
installed separately and activate automatically for Apex, Flow, LWC,
SOQL, metadata, Agentforce, and deployment tasks.

## Commands

| Command      | Purpose                          |
| ------------ | -------------------------------- |
| `/sf-login`  | Authenticate to a Salesforce org |
| `/sf-status` | Check org connection status      |
