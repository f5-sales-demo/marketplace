---
description: Convert an exported BIG-IP ASM policy into offline F5 XC review artifacts
argument-hint: "<policy-path> <signatures-path> <namespace> <output-directory>"
allowed_tools:
  - asm_migration_convert
---

# Convert ASM policy

Parse only `$ARGUMENTS` as `policyPath`, `signaturesPath`, `namespace`,
and `outputDirectory`. If a required value is missing, ask only for the missing
values and stop. Do not infer values from files, memory, or the working
directory.

Otherwise, immediately call `asm_migration_convert` exactly once with those
four values. Pass `targetName`, `allowPartial`, or `overwrite` only when
the user explicitly supplies them. Then report the native result verbatim
without inspecting generated files.

Do not call `todo_write`, `read`, `write`, `edit`, `find`, `grep`,
`bash`, validation, network, deployment, or any other tool. Do not load a
skill, inspect inputs or implementation files, pre-validate, post-validate, or
perform model-driven conversion. The native result is self-sufficient.
