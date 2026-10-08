# ASM Migration

`asm-migration` is a self-contained xcsh plugin for deterministic conversion of exported BIG-IP ASM policies into F5 Distributed Cloud review artifacts. It ports the behavior of XCify 0.2.0 at commit `f8cfc01fa2548f9aa5eb9376104715a523248a6a` under the marketplace's Apache-2.0 license.

Conversion remains offline. The guarded deployment lifecycle contacts only the `XCSH_API_URL` origin and uses environment-only credentials. Its bundled contract is refreshed from the latest published `f5-sales-demo/api-specs-enriched` release by `scripts/update-contract.sh`; exact release, commit, and content hashes are recorded in `contracts/provenance.json`.

## Install

Install the official marketplace release in xcsh 21.0.0 or later:

```sh
xcsh plugin marketplace add f5-sales-demo/marketplace
xcsh plugin install asm-migration@f5-sales-demo-marketplace
```

Restart xcsh after installing or upgrading so a fresh process loads the new
plugin version. On macOS, use `/private/tmp` or a normal non-symlinked
directory for output; `/tmp` is a symlink and is intentionally rejected.
Running `bun test` inside xcsh's installation cache is not an installation
check because development dependencies are intentionally absent there.

## Use

Migration capabilities coexist with Salesforce searches, public research, source
inspection, project discovery, validation, and other authorized work. Native tools
are the preferred migration implementation. Discover inputs from established context
and project files; ask when values are missing or ambiguous. Conversion needs Bun
but no XC credentials or Platform plugin. Missing deployment prerequisites affect
that operation only.

- `/asm-migration:validate` validates an ASM XML policy or generated config pack without writing files.
- `/asm-migration:convert` collects the required paths and namespace, then calls the native conversion tool.
- `/asm-migration:deploy` plans, applies, verifies, or cleans up a receipt-backed deployment. `plan` validates all four artifacts; `apply` and `cleanup` require the exact receipt plan digest under xcsh’s normal user-authorization rules.

Conversion writes exactly `config-pack.json`, `warnings.json`, `report.json`, and `manifest.json`.
Existing managed files are protected unless `overwrite` is explicitly enabled. Partial output is marked
incomplete and cannot be deployed. Deployment requires `XCSH_API_URL`, `XCSH_API_TOKEN`,
`XCSH_USERNAME`, and `XCSH_NAMESPACE`; never pass credentials in prompts or tool arguments.
Apply and cleanup use `planDigest` matching the receipt, without a literal confirmation
phrase. Native operations retain ownership and drift checks, receipt integrity,
contract validation, credential redaction, HTTPS, and API-origin protection.
Additional user-requested files may accompany the four native artifacts.
Receipts must be outside the conversion directory and are written atomically with mode 0600.

The signature mapping must use schema version `asm-migration.signatures/v1`. Generated packs use `asm-migration.config-pack/v1`. Version 2.0.1 requires reconversion: deployment does not repair older config packs whose inline service-policy rules omit required API fields.
Versions through 2.0.3 require reconversion when parameter-range rules are present:
deployment does not repair old config packs containing unsupported or duplicate query predicates.

## Development

```sh
bun install --frozen-lockfile
bun run contract:update
bun test
bun run check:bundle
```

All fixtures are synthetic. Deployment tests use a local mock XC API. Authorized
live deployment is available through the native receipt-backed lifecycle.
