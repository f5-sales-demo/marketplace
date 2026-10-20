# platform

F5 Distributed Cloud platform automation — web console UI
via Chrome DevTools MCP and REST API management via cURL.
Provides Azure SSO authentication, deterministic console
navigation, API token management, and a foundation for
workflow automation across both interfaces.

Platform 7 UAT candidates provide provider-neutral Secure Mesh Site v2 Customer Edge tools
for capability evidence, tenant-bound canonical site changes, API bootstrap checkout, and identity-bound interface status. Legacy Azure VNet Site, AWS VPC/TGW Site,
Fleet, and shared registration-token workflows are removed.
KVM image resolution joins exactly one owned Site UID to its named configuration,
queries `/api/maurice/software_os_version`, checks the exact UID mapping and
empty error status, verifies the HTTPS image and MD5, then rechecks ownership.
The retired external maurice prerequisite is not part of this capability.

The internal upgrade gate evaluates fresh runtime observations against a plan's
logical and physical site identities, contract fingerprints, and effective versions.
It distinguishes readiness, convergence, version completion, failure, and unknown
evidence. Create-time version settings remain separate. Version completion alone
does not establish node, routing, or traffic health; cloud lifecycle adapters must
verify those before advancing a serial upgrade.

`stableCeSiteVersions` captures completed runtime software and OS versions with the
same identity and freshness checks. This supports replacement planning without
changing the original create-time settings, which can retain an older baseline
after an upgrade. A replacement coordinator must freeze these values into its plan,
revalidate them before the first destructive boundary, and verify the replacement
after registration. The version gate alone does not implement that lifecycle.

`captureCeReplacementVersions` records the selected logical site, physical site,
contract identities, and stable runtime versions. `verifyCeReplacementVersions`
collects a new observation and rejects identity or version drift before an intact
site's first destructive operation. Partial shutdown recovery must reconcile the
cloud's actual state and its recorded admission before using these functions;
an offline site cannot pass the stable-version gate. The AWS v2 replacement coordinator now
uses this admission workflow and verifies the new physical identity and installed versions
after registration. `prepareAwsSiteReplacement` collects owned configuration and registered
hardware evidence for an explicit replacement, including a site whose MTUs already match.
Live replacement acceptance is tracked separately from these runtime checks.

The verified HTTP ingress contract also maps site-local HTTP origins. It binds
each outside-network endpoint to an explicit CE site and uses `LOCAL_PREFERRED`
selection. The API's site-bound `private_ip` variant can carry a public address.
Cloud adapters must verify site ownership and origin reachability before using
this mapping; schema validation does not establish traffic health.

## Prerequisites

### Console (Web UI)

- **Chrome DevTools MCP server** connected to the session
- **Browser instance** open and accessible via MCP
- **VPN connection** if required by tenant network policy

### API (REST)

- **XCSH_API_TOKEN** environment variable set with a valid
  API token, or P12 certificate file available
- **VPN connection** if required by tenant network policy

## Environment Variables

| Variable | Domain | Required | Purpose |
| -------- | ------ | -------- | ------- |
| `XCSH_API_URL` | Both | No (has default) | Tenant base URL |
| `XCSH_USERNAME` | Console | Full MFA only | Azure AD email address |
| `XCSH_CONSOLE_PASSWORD` | Console | Full MFA only | Azure AD password |
| `XCSH_API_TOKEN` | API | Yes (unless P12) | API token for REST calls |
| `XCSH_P12_FILE` | API | No (alternative) | Path to P12 certificate |
| `XCSH_P12_PASSWORD` | API | With P12_FILE | P12 certificate password |
| `XCSH_NAMESPACE` | Both | No | Default namespace |
| `XCSH_CE_CONSOLE_HELPER` | CE v2 | Console fallback | Absolute authenticated helper path |

## Skills

| Skill | Type | Domain | Purpose |
| ----- | ---- | ------ | ------- |
| `platform-index` | Auto-activated | Both | Top-level router between console and API |
| `console-index` | Auto-activated | Console | Route console UI requests |
| `console-auth` | Auto-activated | Console | Azure SSO authentication (cached + MFA) |
| `console-navigator` | Auto-activated | Console | Navigate to console sections by name |
| `api-index` | Auto-activated | API | Route REST API requests |
| `api-auth` | Auto-activated | API | API token and P12 certificate auth |

## Secure Mesh Site v2 tools

| Tool | Purpose |
| ---- | ------- |
| `f5xc_ce_v2_capabilities` | Return non-secret SMSv2 provider, bootstrap, network-profile, and AWS TGW Connect schema evidence |
| `f5xc_ce_v2_site` | Plan, read, create, update, or delete CE v2 site and BGP/network configuration |
| `f5xc_ce_v2_bootstrap` | Check out one short-lived token and return only an opaque session reference |
| `f5xc_ce_v2_status` | Observe explicit up/down interfaces from trusted deployment bindings; missing or ambiguous evidence is unknown |

Site operations require an explicit owning deployment binding. Creation and update use a
`WireSiteIntent` containing resolved node hostnames, MAC/device identities, ordered network
roles, addressing, and settings. Plans bind the active tenant, owning engine, site UID, and
resource version. Interface changes that require cloud replacement use the owning cloud
lifecycle rather than changing a primary NIC through the site tool.

Bootstrap uses the verified site-bound JWT and cloud-init API in interactive and headless
execution. Headless issuance requires `XCSH_CE_HEADLESS_MUTATIONS=1`. The tool returns a
short-lived, one-use local reference in a session-owned `0700` directory with `0600` files.
The upstream JWT is privately checkpointed for coordinated revocation; local one-use
consumption does not imply that the vendor JWT itself can be used only once.

The service persists tenant-bound deployment and MAC bindings after verified site and
interface reads. Rebuilt site UIDs or changed contract pins invalidate prior bindings.
Status distinguishes complete explicit down observations from missing, malformed, stale,
partial, duplicated, unauthorized, or unavailable evidence. `fetchedAt` is API retrieval
time; it is not an original CE heartbeat. CE sample-age semantics remain unqualified under
api-specs-enriched #1930, and this public read cannot satisfy a mutation or traffic gate.

The 288-row ledger in `benchmarks/ce-uat-ledger.json` records the required AWS/Azure,
native/Terraform, and topology matrix. `bun scripts/check-ce-uat-readiness.ts` rejects
release until every required feature and acceptance gate has current evidence. These
candidates remain unreleasable while the SLI transition, freshness, API/schema identity
mapping, recovery threshold, Azure live matrix, and installed qualification are incomplete.

## Agents

| Agent | Domain | Purpose |
| ----- | ------ | ------- |
| `console-operator` | Console | Autonomous browser automation executor |
| `api-operator` | API | Autonomous REST API executor (cURL + jq) |

## Commands

| Command | Purpose |
| ------- | ------- |
| `/login-console` | Authenticate to the F5 XC console |
| `/check-api-token` | Validate your F5 XC API token |

## Console Authentication Modes

### Cached Session (fast)

If the user previously authenticated and selected "remember
this device", the plugin clicks "Sign in with Azure" and the
session resumes automatically. Takes 3-8 seconds.

### Full MFA (interactive)

When no cached session exists:

1. Navigate to login page
2. Click "Sign in with Azure"
3. Enter username (from `XCSH_USERNAME`)
4. Enter password (from `XCSH_CONSOLE_PASSWORD`)
5. DUO verified push — plugin reads the 3-digit code from
   screen and relays it to the user to enter in Duo Mobile
6. "Stay signed in?" — plugin clicks Yes for future caching
7. Console loads

## API Authentication

### API Token (recommended)

Set `XCSH_API_TOKEN` and run `/check-api-token` to verify.
Tokens are created in the console at System > Tenant
Management > API Credentials.

### P12 Certificate

Set `XCSH_P12_FILE` and `XCSH_P12_PASSWORD` for mutual TLS
authentication without a token header.

## Usage Examples

```text
# Console: Authenticate
/login-console

# Console: Navigate to a section
"Navigate to HTTP Load Balancers in the demo namespace"

# Console: Check current location
"Where am I in the console?"

# API: Validate token
/check-api-token

# API: List resources
"List all namespaces via the API"

# API: Get resource details
"Get the HTTP load balancer 'my-lb' in namespace 'demo' via API"
```

## Security

- Credentials are read from environment variables only
- Long-lived credentials are never logged, persisted, or echoed; one-use CE
  bootstrap material exists only in the protected temporary handoff described above
- Session cookies are managed by the browser, not the plugin
- API tokens use `$XCSH_API_TOKEN` placeholders in output
