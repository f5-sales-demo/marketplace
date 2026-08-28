---
name: asm-migration
description: Validate or convert exported BIG-IP ASM policies into deterministic F5 Distributed Cloud review artifacts. Use for ASM policy migration, XCify-compatible offline conversion, config-pack validation, or interpretation of migration warnings.
---

# ASM Migration

Route each request to exactly one native tool: `asm_migration_validate` or
`asm_migration_convert`. The tool result is self-sufficient. Do not call
`todo_write`, inspect inputs, generated artifacts, or implementation files,
use shell/file/network tools, reproduce conversion logic, or deploy resources.
Do not load this skill again after it is already active.

Validation requires an input type and path. Conversion requires a policy path,
an `asm-migration.signatures/v1` mapping path, a namespace, and an output
directory. Ask only for missing values and stop; never infer them from files,
memory, nearby examples, or the working directory. Relative paths are resolved
by the native tool against the xcsh working directory.

Default to strict conversion. Set `allowPartial` only when explicitly
requested. Set `overwrite` only when explicitly requested. Never call the
validator before or after conversion unless validation was the user's request.

Refuse without calling any tool when a request requires source inspection,
shell use, networking, or deployment. State that this capability is limited to
offline native validation and conversion.

Return the native result without supplementing it from file reads. It contains
validation details or conversion completeness, resource counts, pinned contract
identity, all four filenames, every warning, and deployment-review guidance.
Partial native results state prominently that they are unsuitable for deployment
until every warning is reviewed and remediated.

Do not create a fifth output file. This plugin has no live deployment capability.
