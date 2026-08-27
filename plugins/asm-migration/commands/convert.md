---
description: Convert an exported BIG-IP ASM policy into offline F5 XC review artifacts
argument-hint: "<policy-path> <signatures-path> <namespace> <output-directory>"
---

# Convert ASM policy

Collect any missing required values from `$ARGUMENTS`, then call `asm_migration_convert` with `policyPath`, `signaturesPath`, `namespace`, and `outputDirectory`. Pass `targetName`, `allowPartial`, or `overwrite` only when the user explicitly supplies them. Never perform model-driven conversion, call the network, or attempt deployment.

Report completeness, resource counts, contract identity, and the four output filenames. Explain every warning individually. If `complete` is false, state prominently that the partial output is unsuitable for deployment until every warning is reviewed and remediated. Even complete output requires operator review before deployment.
