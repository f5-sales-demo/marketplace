# Salesforce Plugin

Container-adapted Salesforce CLI integration for Claude Code. Provides
org authentication and a general-purpose CLI agent that can run any
`sf` command including SOQL queries. Bridges to the official
[forcedotcom/afv-library](https://github.com/forcedotcom/afv-library)
skills for Salesforce development.

## Prerequisites

- **Salesforce CLI** (`@salesforce/cli`): `brew install sf`
- **afv-library skills** (optional): `npx skills add forcedotcom/afv-library`
- **Salesforce org** with API access

## Quick Start

```bash
# Check CLI and org status
/salesforce:sf-status

# Authenticate to an org
/salesforce:sf-login my-org
```

## Authentication

### Workstation (browser available)

Find your Salesforce domain from your browser URL
(`https://acme.lightning.force.com` means your domain is
`acme.my.salesforce.com`), then run:

```bash
sf org login web --alias my-org --set-default --instance-url https://YOUR-DOMAIN.my.salesforce.com
```

### Container / headless (no browser)

Export the SFDX auth URL from an authenticated workstation:

```bash
sf org display --verbose --target-org my-org
```

Copy the `Sfdx Auth Url` value, then in the container:

```bash
echo "$SFDX_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin=- --alias=my-org --set-default
```

### All authentication methods

| Method       | Best For                      | Command                     |
| ------------ | ----------------------------- | --------------------------- |
| Web Login    | Workstations with browser/SSO | `sf org login web`          |
| SFDX URL     | Containers, CI/CD             | `sf org login sfdx-url`     |
| JWT Bearer   | Automated pipelines           | `sf org login jwt`          |
| Access Token | Environment variable auth     | `sf org login access-token` |

**Note:** Device flow (`sf org login device`) is blocked since August
2025.

## Environment Variables

| Variable              | Purpose                            |
| --------------------- | ---------------------------------- |
| `SF_ACCESS_TOKEN`     | Bearer token for access-token auth |
| `SFDX_AUTH_URL`       | Force auth URL for sfdx-url auth   |
| `SF_ORG_INSTANCE_URL` | Org instance URL                   |
| `SF_JWT_KEY_FILE`     | Path to JWT private key            |
| `SF_CLIENT_ID`        | Connected App consumer key         |
| `SF_USERNAME`         | Salesforce username for JWT        |

## Usage Examples

After authenticating, use natural language to query your Salesforce
data. Replace placeholder values with your own information.

### Account discovery

```
what salesforce accounts am I on the account team for? My email is your-email@company.com
```

### Coverage cross-reference

```
find all accounts where Colleague Name is on the account team, then check if your-email@company.com is also tagged on each one
```

### Opportunity pipeline

```
show me all open salesforce opportunities on Colleague Name's accounts, sorted by amount
```

### Quarterly forecast

```
group open opportunities by close date quarter with count, total amount, and weighted amount
```

### Opportunity deep dive

```
show me a detailed view of the OPPORTUNITY NAME opportunity including team members, activities, and contacts
```

### Support cases

```
show me all open salesforce cases across Colleague Name's accounts, grouped by account
```

### Case lookup

```
look up salesforce case CASE-NUMBER and show me the details, customer account, and owner
```

### Account overview

```
give me a full account overview for ACCOUNT NAME including contacts, open opportunities, and recent cases
```

## Skills

| Skill              | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `salesforce-index` | Routes requests to the right skill or agent |
| `salesforce-auth`  | Container-adapted org authentication        |

## Commands

| Command                 | Purpose                          |
| ----------------------- | -------------------------------- |
| `/salesforce:sf-login`  | Authenticate to a Salesforce org |
| `/salesforce:sf-status` | Check org connection status      |

## Development Skills (via afv-library)

The 30 Salesforce development skills from `forcedotcom/afv-library` are
installed separately and activate automatically for Apex, Flow, LWC,
SOQL, metadata, Agentforce, and deployment tasks.
