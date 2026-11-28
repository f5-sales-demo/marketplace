# Salesforce Plugin

Salesforce account and pipeline intelligence for xcsh. Six native tools discover
org schema, query records, inspect authenticated orgs, generate pipeline reports,
and run confirmed read-only CLI commands. xcsh owns the theme, layout, expansion
and keyboard controls.

## Prerequisites

- xcsh 25.2.0 or later and Salesforce CLI (`sf`). Setup reuses a working CLI.
  Missing CLI setup uses Homebrew without sudo on macOS or a verified official
  per-user archive on Linux. An unsupported host or unavailable package reports
  readiness guidance instead of claiming success.
- An authenticated Salesforce org with the required API permissions.
- Optional Salesforce development skills from
  [forcedotcom/afv-library](https://github.com/forcedotcom/afv-library).

Run `xcsh plugin setup salesforce` to review authentication and discover private org configuration. Valid authentication is reused; repeating setup refreshes metadata and preserves confirmed choices. Browser OAuth is reviewed only when authentication is needed. Salesforce CLI project/global defaults select the org unless a tool explicitly selects one.

## Private configuration

Setup saves versioned metadata and confirmed report mappings to `~/.xcsh/private/salesforce/config.json`.
`SF_PIPELINE_CONFIG` may select another absolute user-owned file. Directories are private (0700), files are
private (0600), and replacement is atomic. Concurrent edits, cancellation, invalid mappings and write failures
preserve the current file. Probes and tools never rewrite configuration.

Entries are keyed by verified organization ID and separate discovery from report mappings. Discovery retains identity, accessible object names, relevant field descriptions, fiscal periods and optional territory/product candidates. It saves no account or opportunity records and no authentication secrets.

The default revenue fields are `Opportunity.Amount` and supported `OpportunityLineItem.TotalPrice`. Custom
revenue, renewal predicates, territory paths, product groups and quota eligibility require confirmation
against the selected schema. Product groups use exact-value or prefix rules with validated field paths. Leave
optional business meanings unresolved, or enter `-` to clear a saved optional field/predicate and `[]` to
clear groups.

For example, after confirming that the field is available, a group can be entered as:

```json
[{"name":"Services","quotaEligible":false,"rules":[{"field":"Product2.Family","match":"exact","value":"Services"}]}]
```

This is a synthetic mapping example, not a shipped product rule. Unmatched or ambiguous products remain Uncategorized. Cache keys include the org, user and configuration revision; changing the CLI default or reassigning an alias cannot reuse another org's IDs or scope.

## Native tools

| Tool | Purpose |
| --- | --- |
| `sf_query` | Ad-hoc SOQL and account/opportunity investigation |
| `sf_describe` | Confirm field names, types, picklists and child relationships |
| `sf_org_display` | Show safe org identity and connection fields |
| `sf_pipeline_report` | Owner-or-team pipeline, separate product values and supported fiscal sections |
| `sf_help` | Read CLI command help |
| `sf_exec` | Execute an allowlisted read-only command with exact arguments |

Tools register when the CLI is available and can be discovered progressively.
Authentication, permission and network failures remain visible errors.

## Project and customer investigation

Ask xcsh to read the project, identify the customer, and find recent opportunities.
The workflow verifies local account evidence against Salesforce, distinguishes
ambiguous matches, and queries the verified account in one selected org. It
states the recency window and uses confirmed schema and product mappings. A customer investigation is account-scoped;
it does not silently restrict results to personal opportunity-team membership.

Expect opportunity name/link, stage, amount with currency, owner, close and
recency dates, product evidence, source files, query coverage and uncertainty.
Different currencies remain separate. Null fields mean not populated. Zero
results is a conclusion within the stated filter and returned-page scope.

## Schema and complete details

Use `sf_describe {sobject: "Opportunity", match: "product"}` to find actual
field names. Custom schema varies by org. Matching uses API names and labels;
picklists, filterability, groupability and child relationship names are retained.
The model-facing schema response is a bounded discovery preview with explicit
withheld counts. Expanded terminal output exposes every returned field and
relationship when no match is selected, or every matching item for a match.

Query previews show purpose, returned count, completeness, org and readable SOQL once.
Names/subjects, related entities, status, amounts/currency and dates lead record columns.
Technical IDs move to expanded details only when another useful identifier is returned,
with the omitted-column count. Aggregate metrics distinguish counts from amounts, preserve
source precision and numeric strings, and never infer an absent currency.
Expanded results retain every returned record, nested field and argument.
The CLI execution path retains complete stdout and warning output. Long and
multiline values wrap using xcsh's shared width-aware tables and active theme.

Describe previews put labels, exact API names, readable types and filter/group capabilities
first. Custom fields, complete picklists, reference targets, relationships and normalized
metadata stay expandable. Org status, environment and default flags use only reported
whitelisted identity evidence; missing values remain explicit. Help orders command purpose,
usage, required inputs, optional flags and examples, retaining unfamiliar sections on expansion.
CLI execution recognizes query/search, schema, org, limits and export/resume status; other
structured output uses a labeled generic fallback. Literal code, logs and help stay readable,
and exact argv, shell quoting, complete output and diagnostics stay expandable.

## Pipeline reports

Default personal coverage includes opportunities owned by the verified user or listing that user as a team member. Separate queries are deduplicated by opportunity ID. Owner, team and overlap counts are reported. Missing team access gives explicit owner-only coverage. Person-profile IDs, partners and inferred territories never expand this scope.

Opportunity amounts and line-item product amounts stay separate because they may measure different revenue. All unmatched amounts remain in their respective totals. Quota totals appear only when all included amounts have explicit eligibility. Different currencies stay separate.

Reports include open pipeline, supported quarter/fiscal bookings, confirmed renewals, forecast, close-date distribution and top deals. Missing fiscal periods or optional capabilities show unavailable coverage. Failed or incomplete queries never become verified zero totals. Full sanitized source queries and returned rows remain available in expanded evidence.

## Verification

`bun test` runs the Salesforce unit regressions. From the repository root,
`bun plugins/salesforce/benchmarks/scenarios.ts` also runs actual registration
and published-runtime terminal tests. Install each frozen dependency graph
first, including `scripts/agent-validation-runtime`.

`benchmarks/prompts.json` defines the separate model-driven acceptance matrix.
`benchmarks/ACCOUNT_BRIEF.md` and `fixture-sf.ts` supply synthetic project and
CLI data, including ten Tasks, count/amount aggregates and Event schema. Route `sf` to the fixture explicitly in an isolated test pane and
load the candidate plugin with `--plugin-dir`; never treat fixture outcomes as
live Salesforce results. Verify normal installed tools against authenticated
Salesforce separately on the host that holds the credentials. Keep real
customer files and results out of public receipts.

## Authentication

Run `xcsh plugin setup salesforce` from an interactive terminal. xcsh
shows the immutable installer, login, dependency, environment-name,
profile-collection, and verification plan before asking for confirmation.
The plugin never performs authentication from a model-callable tool.

For an organization with My Domain, set its login URL before setup:

```bash
SF_ORG_INSTANCE_URL=https://example.my.salesforce.com xcsh plugin setup salesforce
```

Setup uses `SF_ORG_INSTANCE_URL` first, then the Salesforce CLI's
`org-instance-url` configuration. With neither configured, it uses
`https://login.salesforce.com`. Lightning URLs such as
`https://example.lightning.force.com` are converted to
`https://example.my.salesforce.com`; sandbox Lightning domains retain
their sandbox name. The review shows the effective URL in `--instance-url`.
Changing the configured URL after review requires a new review.

To persist a My Domain selection without editing shell startup files:

```bash
sf config set org-instance-url=https://example.my.salesforce.com --global
xcsh plugin setup salesforce
```

## Environment Variables

| Variable              | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `SF_PIPELINE_CONFIG`  | Optional absolute path for private org configuration |
| `SF_ORG_INSTANCE_URL` | Login endpoint for reviewed browser authentication   |
| `SF_TARGET_ORG`       | Existing Salesforce target-org selection             |
| `SFDX_AUTH_URL`       | Provider-managed authentication input                |

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

| Command                        | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `xcsh plugin setup salesforce` | Review and run Salesforce installation and authentication |
| `/salesforce:sf-status`        | Check org connection status                               |

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

Generated command blocks include the full CLI arguments and can be copied into Bash or Zsh.
Explicit line continuations keep the command valid in narrow terminal views. Copy the complete
command block; returned CLI usage/help remains its original template text.
