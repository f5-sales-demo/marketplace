---
description: Validate an ASM policy or ASM migration config pack offline
argument-hint: "<asm-policy|config-pack> <path>"
---

# Validate ASM migration input

Parse `$ARGUMENTS` as an input type followed by a path. Call `asm_migration_validate` with `inputType` and `inputPath`. Do not inspect or reinterpret the policy with the model and do not use network tools.

Report whether validation passed. For a config pack, explain every returned contract issue with its resource index and path. For a policy, report enforcement mode and each unsupported enabled feature. Validation never writes files.
