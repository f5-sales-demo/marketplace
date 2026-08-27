---
name: asm-migration
description: Validate or convert exported BIG-IP ASM policies into deterministic F5 Distributed Cloud review artifacts. Use for ASM policy migration, XCify-compatible offline conversion, config-pack validation, or interpretation of migration warnings.
---

# ASM Migration

Use the native `asm_migration_validate` and `asm_migration_convert` tools. Never reproduce conversion logic in the model, use network access, or deploy the generated resources.

Validate inputs before conversion when the user asks for a review. Conversion requires a policy path, an `asm-migration.signatures/v1` mapping path, a namespace, and an output directory. Relative paths are resolved by the tool against the xcsh working directory.

Default to strict conversion. Set `allowPartial` only when the user explicitly accepts review-only partial output. Set `overwrite` only when the user explicitly authorizes replacement of the four managed files. The tool preserves unrelated files.

After conversion:

1. Report `complete`, resource counts, the pinned contract identity, and all four output filenames.
2. Explain each warning using its code and message.
3. If output is partial, clearly state that it is unsuitable for deployment until every warning is reviewed and remediated.
4. If output is complete, still recommend operator review of rules, signature mappings, client networks, blocking behavior, and the contract validation report.

Do not create a fifth output file. This plugin has no live deployment capability.
