# ASM Migration

`asm-migration` is a self-contained xcsh plugin for deterministic conversion of exported BIG-IP ASM policies into F5 Distributed Cloud review artifacts. It ports the behavior of XCify 0.2.0 at commit `f8cfc01fa2548f9aa5eb9376104715a523248a6a` under the marketplace's Apache-2.0 license.

Conversion remains offline. The guarded deployment lifecycle contacts only the `XCSH_API_URL` origin and uses environment-only credentials. Its bundled contract is refreshed from the latest published `f5-sales-demo/api-specs-enriched` release by `scripts/update-contract.sh`; exact release, commit, and content hashes are recorded in `contracts/provenance.json`.

## Install

Install the official marketplace release in xcsh 20.22.3 or later:

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

- `/asm-migration:validate` validates an ASM XML policy or generated config pack without writing files.
- `/asm-migration:convert` collects the required paths and namespace, then calls the native conversion tool.
- `/asm-migration:deploy` plans, applies, verifies, or cleans up a receipt-backed deployment. `plan` validates all four artifacts; `apply` and `cleanup` require digest-bound confirmations.

Conversion writes exactly `config-pack.json`, `warnings.json`, `report.json`, and `manifest.json`.
Existing managed files are protected unless `overwrite` is explicitly enabled. Partial output is marked
incomplete and cannot be deployed. Deployment requires `XCSH_API_URL`, `XCSH_API_TOKEN`,
`XCSH_USERNAME`, and `XCSH_NAMESPACE`; never pass credentials in prompts or tool arguments.
Receipts must be outside the conversion directory and are written atomically with mode 0600.

The signature mapping must use schema version `asm-migration.signatures/v1`. Generated packs use `asm-migration.config-pack/v1`. Version 2.0.1 requires reconversion: deployment does not repair older config packs whose inline service-policy rules omit required API fields.
Versions through 2.0.2 require reconversion when parameter-range rules are present:
deployment does not repair old config packs containing unsupported lookahead expressions.

## Development

```sh
bun install --frozen-lockfile
bun run contract:update
bun test
bun run check:bundle
```

All fixtures are synthetic. Network imports and live deployment behavior are prohibited.
