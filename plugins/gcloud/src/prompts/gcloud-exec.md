Execute any `gcloud` CLI command directly.

This is the general-purpose tool for running Google Cloud CLI commands that are not covered by the typed tools. Use typed tools when available — they validate inputs and return structured data.

## Usage

Pass the group, verb, and flags as an array of arguments. Do NOT include `gcloud` itself — it is prepended automatically.

**Example:** To run `gcloud compute instances list --filter="status=RUNNING"`:

```json
{ "args": ["compute", "instances", "list", "--filter=status=RUNNING"] }
```

## Safety

- Arguments are passed as an array directly to the `gcloud` binary — **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `gcloud` invocation runs, including full `--filter` and `--format` expressions. Only NUL/control bytes are rejected.
- **Read-only by default.** Only recognized read verbs run:
  - Exact reads: `list`, `describe`, `get-iam-policy`, `get-value`, `get-server-config`, `get-ancestors`, `list-grantable-roles`, `print-settings`, `version`, `info`.
  - Read prefixes: any verb starting with `list-` or `describe-`.
  - Top-level: `version`, `info`, `help`, `topic`, `cheat-sheet`.
- **Mutating verbs are blocked** (`create`, `delete`, `update`, `patch`, `set`, `deploy`, `enable`, `disable`, `set-iam-policy`, `add-iam-policy-binding`, …). Run write/destructive operations through an explicitly confirmed path — delegate to the `gcloud:cli-operator` agent, not `gcloud_exec`.
- **Execution and credential vectors are blocked** even though some look read-shaped: `ssh`, `scp`, `connect`, `call`, `interactive`, `login`, `revoke`, `get-credentials`, `print-access-token`, `print-identity-token`, `reset-windows-password`, `simulate-maintenance-event`, `enable-service`, `configure-docker`. These open sessions, run code, or mint/print credentials — route them through the `gcloud:cli-operator` agent.
- Unrecognized verbs are blocked (fail-safe): provide an explicit read-only verb.
- Output is capped to prevent context overflow.

## Querying: `--filter` vs `--format`

gcloud splits querying into two distinct, complementary flags. This is **not** Azure `--query` (JMESPath): filtering and projection are separate.

### `--filter` — server-side selection (which resources)

Restricts *which* resources are returned, evaluated before results are sent back.

- Equality: `--filter="status=RUNNING"` (`key=value`)
- Boolean logic: `--filter="status=RUNNING AND zone:us-central1"` (`AND` / `OR`)
- Substring match: `--filter="name:prod"` (`:` — has-substring)
- Regex match: `--filter="name~^web-.*"` (`~`)

### `--format` — client-side projection (how to show it)

Shapes *how* the selected resources are rendered locally.

- `--format=json` (default when you pass no `--format`)
- `--format=value(name)` — bare field value(s), no keys
- `--format="table(name,status,zone)"` — tabular columns
- `--format=csv(name,status)` — comma-separated
- `--format=yaml` — YAML document
- `--format=flattened` — flat `key: value` lines

## Tips

- `--format=json` is added automatically unless you pass your own `--format` (e.g. `--format="table(name)"`, `--format=yaml`), which is respected.
- `--limit=N` caps the number of results; `--sort-by=field` orders them.
- `--project=PROJECT_ID` targets a specific Google Cloud project.
- Combine freely: `["compute", "instances", "list", "--filter=status=RUNNING", "--sort-by=name", "--format=value(name)"]`.
