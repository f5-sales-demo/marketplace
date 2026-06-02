# Configuration Ownership Rules

The build image (`docs-builder`) copies configuration
files from the theme package at image build time. This is
the mechanism that enforces single-source-of-truth.

## File Ownership

- `astro.config.mjs` — copied from `docs-theme` into the
  image. **Never** create or override this file in
  `docs-builder` or any content repository.
- `content.config.ts` — copied from `docs-theme` into the
  image. Same rule applies.
- Astro integrations and Starlight plugins — defined in
  `docs-theme/config.ts`. To add a new integration, add
  it to docs-theme, not docs-builder.
- npm packages (icon packs, runtime libraries) — added to
  `docs-builder/package.json`. These are build-time
  dependencies that integrations in docs-theme consume.
- `uno.config.ts`, `tsconfig.json`, and other tooling
  configs — owned by `docs-theme` if they affect the Astro
  build. `docs-builder` must not create competing configs.

## Pattern for Adding New Capabilities

For example, adding icon packs:

1. Add the npm data packages to
   `docs-builder/package.json`
2. Add the Astro integration/plugin to
   `docs-theme/config.ts`
3. The Dockerfile copies the updated config from
   docs-theme at build time — no manual config in
   docs-builder needed

## Icon Package Pipeline

`docs-icons` owns all icon packaging — Iconify JSON sets
and Astro components. On npm publish, `docs-icons`
dispatches to `docs-builder` to rebuild the Docker image
with updated icon packages. Content repositories never
install icon packages directly.
