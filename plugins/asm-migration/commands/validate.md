---
description: Validate an ASM policy or ASM migration config pack offline
argument-hint: "<asm-policy|config-pack> <path>"
---

# Validate ASM migration input

Parse only `$ARGUMENTS` as an input type followed by a path. If either value is
missing, ask only for the missing value and stop. Do not infer values from files,
memory, or the working directory.

Otherwise, immediately call `asm_migration_validate` exactly once with
`inputType` and `inputPath`, then report its result. Do not call
`todo_write`, `read`, `write`, `edit`, `find`, `grep`, `bash`,
network, deployment, or any other tool. Do not load a skill, inspect inputs or
implementation files, pre-validate, post-validate, or reinterpret the result.
Validation is read-only; the native result contains every detail to report.
