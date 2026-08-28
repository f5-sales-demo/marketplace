# ASM Migration

`asm-migration` is a self-contained xcsh plugin for deterministic, offline conversion of exported BIG-IP ASM policies into F5 Distributed Cloud review artifacts. It ports the behavior of XCify 0.2.0 at commit `f8cfc01fa2548f9aa5eb9376104715a523248a6a` under the marketplace's Apache-2.0 license.

The plugin never contacts an F5 XC tenant and cannot deploy resources. Its contract is derived from `f5-sales-demo/api-specs-enriched` commit `3ce4b0b270f35cbd35aeb93cbe35c3d23a74542e`.

## Install

Add this repository as a local marketplace in xcsh 20.22.3 or later, then install the non-default `asm-migration` plugin. The committed runtime bundle includes its XML parser and schema validator; Python and a separate dependency-install step are not required.

Restart xcsh after installing or upgrading so a fresh process loads the new
plugin version. On macOS, use `/private/tmp` or a normal non-symlinked
directory for output; `/tmp` is a symlink and is intentionally rejected.
Running `bun test` inside xcsh's installation cache is not an installation
check because development dependencies are intentionally absent there.

## Use

- `/asm-migration:validate` validates an ASM XML policy or generated config pack without writing files.
- `/asm-migration:convert` collects the required paths and namespace, then calls the native conversion tool.

Conversion writes exactly `config-pack.json`, `warnings.json`, `report.json`, and `manifest.json`. Existing managed files are protected unless `overwrite` is explicitly enabled. Partial output is marked incomplete and is unsuitable for deployment until every warning is reviewed and remediated.

The signature mapping must use schema version `asm-migration.signatures/v1`. Generated packs use `asm-migration.config-pack/v1`.

## Development

```sh
bun install --frozen-lockfile
bun test
bun run check:bundle
```

All fixtures are synthetic. Network imports and live deployment behavior are prohibited.
