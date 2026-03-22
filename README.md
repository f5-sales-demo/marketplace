# Marketplace

[![GitHub Pages Deploy](https://github.com/f5xc-salesdemos/marketplace/actions/workflows/github-pages-deploy.yml/badge.svg)](https://github.com/f5xc-salesdemos/marketplace/actions/workflows/github-pages-deploy.yml)
[![Repository Settings](https://github.com/f5xc-salesdemos/marketplace/actions/workflows/enforce-repo-settings.yml/badge.svg)](https://github.com/f5xc-salesdemos/marketplace/actions/workflows/enforce-repo-settings.yml)
[![License](https://img.shields.io/github/license/f5xc-salesdemos/marketplace)](LICENSE)
![Plugins](https://img.shields.io/badge/plugins-2-blue)

A Claude Code plugin marketplace for the [f5xc-salesdemos](https://github.com/f5xc-salesdemos) documentation platform. Provides shared skills, commands, and agents that extend Claude Code for documentation authoring and demo workflows across 20+ repositories.

## Plugin Catalog

| Plugin                                                | Version | Category     | Description                                                                                    |
| ----------------------------------------------------- | ------- | ------------ | ---------------------------------------------------------------------------------------------- |
| [f5xc-docs-tools](plugins/f5xc-docs-tools/)           | 1.0.0   | Productivity | MDX content validation and review tools for documentation repositories                         |
| [f5xc-sales-engineer](plugins/f5xc-sales-engineer/)   | 1.0.0   | Productivity | Sales Engineer persona framework — demo execution, presentation, Q&A, environment management   |

## Quick Start

```text
/plugin marketplace add f5xc-salesdemos/marketplace
/plugin install f5xc-docs-tools@f5xc-salesdemos-marketplace
/plugin install f5xc-sales-engineer@f5xc-salesdemos-marketplace
```

## Documentation

Full documentation is available at **[f5xc-salesdemos.github.io/marketplace](https://f5xc-salesdemos.github.io/marketplace/)**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow rules, branch naming, and CI requirements. The [contributing guide](https://f5xc-salesdemos.github.io/marketplace/contributing/) covers how to create and submit a new plugin.

## License

See [LICENSE](LICENSE).
