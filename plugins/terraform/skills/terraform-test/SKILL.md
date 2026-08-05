---
name: terraform-test
description: |
  Automated testing skill for Terraform infrastructure. Provides native terraform test (*.tftest.hcl), validation, and linting patterns.
---

# Terraform Testing & Verification Skill

## Overview
Automated testing ensures infrastructure-as-code behaves predictably before applying changes to live environments.

## Native `terraform test` Suites (`*.tftest.hcl`)
Use `*.tftest.hcl` files to validate resource attributes during `plan` or `apply` stages:

```hcl
variables {
  namespace = "staging"
}

run "verify_http_loadbalancer" {
  command = plan

  assert {
    condition     = xcsh_http_loadbalancer.example.namespace == "staging"
    error_message = "HTTP Load Balancer namespace does not match staging"
  }
}
```

## Quality Gate Workflow
1. `terraform fmt -check` -> Code formatting.
2. `terraform init` -> Provider initialization.
3. `terraform validate` -> Schema & syntax check.
4. `terraform test` -> Executing `*.tftest.hcl` assertions.
