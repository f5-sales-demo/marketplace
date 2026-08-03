# Salesforce Plugin

Container-adapted Salesforce CLI integration for Claude Code with native
xcsh pipeline intelligence tools. Provides org authentication, a
general-purpose CLI agent that can run any `sf` command including SOQL
queries, and xcsh extension tools for pipeline reporting and context
discovery. Bridges to the official
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

## xcsh Extension

The plugin registers an xcsh extension (`src/index.ts`) that provides
native tools accessible to any xcsh-compatible shell session. These
tools are registered automatically when the Salesforce CLI (`sf`) is
detected in the environment.

### Native Tools

| Tool | Purpose |
| --- | --- |
| `sf_setup` | Verify Salesforce CLI installation and org connectivity |
| `sf_query` | Execute SOQL queries against authenticated orgs |
| `sf_describe` | Look up an object's real field and relationship names |
| `sf_org_display` | Display org details (alias, username, instance URL, status) |
| `sf_pipeline_report` | Generate F5 Distributed Cloud pipeline intelligence report |

### Schema discovery

Salesforce orgs are heavily customized: a mature Opportunity carries several
hundred custom fields, and two orgs rarely share them. Field names therefore
have to be looked up rather than assumed, so `sf_describe` filters an object's
schema down to what was asked for:

```text
sf_describe {sobject: "Opportunity", match: "competitor"}
```

It matches on both API name and label, returns active picklist values, and
lists matching child relationships. An unfiltered call returns the standard
fields plus a count rather than the whole catalog.

When a query fails with `No such column`, the error names the rejected column
and points here.

### Pipeline Report

The `sf_pipeline_report` tool queries Salesforce for opportunity pipeline
data and generates a structured report including:

- Open opportunities sorted by close date and amount
- Quarterly forecast with weighted pipeline totals
- Account team coverage analysis
- Stage distribution and conversion metrics

The report uses prompt templates from `src/prompts/` to produce
consistent, actionable output for sales engineering workflows.

### Context Discovery

The extension injects Salesforce context before each agent turn via the
`before_agent_start` event. When an authenticated org is detected, a
background context loader (`src/context/salesforce-context.ts`) gathers:

- Authenticated org metadata (alias, username, instance URL)
- Active pipeline summary (opportunity count, total amount)
- Recent activity indicators

This context is injected as a non-displayed hint, giving downstream
agents awareness of the Salesforce environment without cluttering the
conversation.

## Authentication

### Workstation (browser available)

Find your Salesforce domain from your browser URL
(`https://example-corp.lightning.force.com` means your domain is
`example-corp.my.salesforce.com`), then run:

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

```text
what salesforce accounts am I on the account team for? My email is your-email@example.com
```

### Coverage cross-reference

```text
find all accounts where Colleague Name is on the account team, then check if your-email@example.com is also tagged on each one
```

### Opportunity pipeline

```text
show me all open salesforce opportunities on Colleague Name's accounts, sorted by amount
```

### Quarterly forecast

```text
group open opportunities by close date quarter with count, total amount, and weighted amount
```

### Opportunity deep dive

```text
show me a detailed view of the OPPORTUNITY NAME opportunity including team members, activities, and contacts
```

### Support cases

```text
show me all open salesforce cases across Colleague Name's accounts, grouped by account
```

### Case lookup

```text
look up salesforce case CASE-NUMBER and show me the details, customer account, and owner
```

### Account overview

```text
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

## CLI Agent

The `cli-operator` agent (`agents/cli-operator.md`) executes Salesforce
CLI commands on behalf of the main session. It enforces safety rules:

- Read-only by default; deployments require explicit confirmation
- Never echoes credentials or auth URLs
- Sanitizes user-provided values against shell injection
- Uses `--json` output for structured parsing

Skills and commands delegate to this agent rather than running `sf`
commands directly in the main session, keeping context lean since sf CLI
output can be verbose.

## Development Skills (via afv-library)

The 30 Salesforce development skills from `forcedotcom/afv-library` are
installed separately and activate automatically for Apex, Flow, LWC,
SOQL, metadata, Agentforce, and deployment tasks.
