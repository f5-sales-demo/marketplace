---
name: terraform-troubleshoot
description: |
  Troubleshooting and error recovery playbook for Terraform operations, cycle errors, state locks, and schema mismatches.
---

# Terraform Troubleshooting & Recovery Skill

## Diagnostic Playbook

### 1. Cycle Errors (Dependency Loops)

- **Symptom**: `Error: Cycle: resource_A, resource_B`
- **Resolution**: Break circular references using intermediate resource blocks, separate module outputs, or data sources.

### 2. State Lock Conflicts

- **Symptom**: `Error: Error acquiring the state lock`
- **Resolution**:
  1. Confirm no parallel pipeline runs.
  2. Inspect lock ID in error message.
  3. Run `terraform force-unlock <LOCK-ID>` after verifying safety.

### 3. Missing OneOf Block / Schema Mismatches

- **Symptom**: `Error: one of X must be set`
- **Resolution**: Consult Level 2 schema (`xcsh://terraform/{category}/{resource}`) and inject the required empty variant block (e.g. `advertise_on_public_default_vip {}`).

### 4. Dev Overrides / Offline Validation

- **Symptom**: `terraform init` fails due to local `~/.terraformrc` dev overrides.
- **Resolution**: Bypass init failure and run `terraform validate` directly — `validate` functions under `dev_overrides` without remote registry access.
