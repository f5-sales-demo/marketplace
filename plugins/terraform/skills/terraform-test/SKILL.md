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

Review every test run before execution: a run without an explicit `command = plan`
defaults to apply. Provider initialization can use the network, and tests can
create infrastructure. Use an independently reviewed target and credentials for
those workflows.

## Safe Local Plan Fixture

This resource-free fixture needs Terraform 1.6 or newer and Bash. It uses no
providers, remote backend, credentials or infrastructure. An empty CLI config and
a clean command environment prevent inherited CLI arguments or developer overrides
from changing the workflow. The temporary directory is removed on exit.

```bash
set -euo pipefail
terraform_fixture_dir=$(mktemp -d)
trap 'rm -rf "$terraform_fixture_dir"' EXIT
cd "$terraform_fixture_dir"
: > terraform.rc
cat > main.tf <<'HCL'
terraform {
  required_version = ">= 1.6.0"
}

variable "count_value" {
  type    = number
  default = 0
}

variable "enabled" {
  type    = bool
  default = false
}

variable "label" {
  type    = string
  default = ""
}

output "summary" {
  value = {
    count_value = var.count_value
    enabled     = var.enabled
    label       = var.label
  }
}
HCL
mkdir tests
cat > tests/summary.tftest.hcl <<'HCL'
run "summary_plan" {
  command = plan

  assert {
    condition     = output.summary.count_value == 0 && output.summary.enabled == false && output.summary.label == ""
    error_message = "The summary must preserve zero, false and the empty string."
  }
}
HCL
terraform_fixture() {
  env -i PATH="$PATH" TF_CLI_CONFIG_FILE="$terraform_fixture_dir/terraform.rc" CHECKPOINT_DISABLE=1 terraform "$@"
}
terraform_fixture fmt -check
terraform_fixture init -backend=false -input=false
terraform_fixture validate
terraform_fixture test -no-color
```
