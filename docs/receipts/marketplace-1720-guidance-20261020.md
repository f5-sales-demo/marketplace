# Installed guidance capture lane

Campaign: <https://github.com/f5-sales-demo/marketplace/issues/1579>.
Runner: <https://github.com/f5-sales-demo/marketplace/issues/1720>.
Runtime prerequisite: <https://github.com/f5-sales-demo/xcsh/issues/5047>.

The observer captures admitted built-in Read execution separately from native tool and assistant results. Each
read requires a fresh dispatch identity, exact reviewed path and arguments, and matching execution start.
Guidance cases bind the shipped relative path and SHA256 at admission, so parallel completion order cannot
assign another file's expectations. Failed reads retain their outcome. Agent completion and shutdown clear
pending admissions and executions. Existing workflow IDs remain unchanged; prior captures cannot be
overwritten.

## Source checks

The failing lane and cancellation regressions were retained privately before implementation. Final shared
checks passed 67 tests and 22,564 assertions across eight files. Focused observer tests passed seven tests and
38 assertions. Biome found warnings only. Staged privacy enforcement found zero findings. Whole-repository
privacy findings previously recorded in #1718 remain separate and are not claimed clean.

Ubuntu full plugin suites passed with isolated CI-declared PyYAML 6.0.3 fixture dependencies.
The initial missing-PyYAML KVM fixture failure remains private. Hermeticity, minimum-runtime
checks and plugin manifest validation also passed.

## Installed observation

Mac: published runtime 23.9.3, ASM migration 2.3.1, scenario `asm-installed-guidance-presentation`. Four
actual complete reads used exact installed paths with `sel: ""` and `timeout: 20`. No native tool, Bash,
network, deployment or service action was admitted. Actual results and model conclusions remain private.

The guidance lane produced 192 frames: four files at 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd. The first inspection retained invalid assumptions about an untrusted-input marker.
Subsequent named inspections preserve those failures. Independent filename-only checks, bound to each recorded
relative path and verified source digest, found 108 failing frames: Read truncates long installed-cache paths
from the right and hides the filename. Earlier captures with expectations incorrectly assigned by prompt order
are also preserved; they do not establish acceptance.

The runner is exercised; guidance layout remains BLOCKED. Next action: implement and publish runtime #5047,
independently verify the stable artifacts, then repeat file-bound installed matrices on Mac and Ubuntu. No
affected plugin layout gate is VERIFIED by this receipt. Existing ASM native fixture and executed offline
workflow receipts remain separate.
