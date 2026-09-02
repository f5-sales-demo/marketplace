---
name: terraform-author
description: |
  Senior DevOps HCL Authoring skill. Enforces HashiCorp Provider Registry lookups, variable validation, outputs, modular architecture, and minimum-settings rules for Terraform IaC.
---

# Senior DevOps Terraform Authoring Skill

## Overview

This skill provides operational standards for writing maintainable, production-ready Terraform HCL code across F5 Distributed Cloud and cloud ecosystems (AWS, Azure, GCP).

## Standards Checklist

1. **Registry Version Discovery**: Query HashiCorp Registry (`xcsh://registry/provider/...`) or external sources before writing provider constraints (`~> X.Y.Z`).
2. **Strict Skeleton**: Always include `terraform {}` with `required_providers` and an explicit `provider "<name>" {}` block.
3. **Variable Engineering**:
   - `variables.tf` with `type`, `description`, and `validation` blocks.
   - `sensitive = true` for confidential parameters.
4. **Outputs**:
   - `outputs.tf` with descriptive output blocks and explicit type handling.
5. **DRY & Minimum Settings**:
   - Omit server-applied defaults.
   - Keep configurations concise and default-free.
