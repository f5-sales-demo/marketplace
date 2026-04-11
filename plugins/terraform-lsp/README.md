# Terraform LSP

Terraform language server plugin for Claude Code, providing code intelligence for `.tf` and `.tfvars` files via [terraform-ls](https://github.com/hashicorp/terraform-ls).

## Prerequisites

Install `terraform-ls` before enabling this plugin:

- **Via HashiCorp releases (recommended):** Download from https://releases.hashicorp.com/terraform-ls/
- **Via Homebrew (macOS):** `brew install hashicorp/tap/terraform-ls`
- **Via package manager (Linux):** See [installation docs](https://github.com/hashicorp/terraform-ls/blob/main/docs/installation.md)

## Features

- Go to Definition for resources, variables, and modules
- Find References across Terraform configurations
- Hover documentation for providers, resources, and attributes
- Real-time diagnostics and validation
