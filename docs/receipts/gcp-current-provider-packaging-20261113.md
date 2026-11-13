# Current GCP provider packaging on November 13

The candidate now selects the published Terraform 1.17.2, Google 8.11.0 and XC
provider 15.16.2 packages. Fresh public registry metadata confirmed this tuple.
The raw authenticated provider lock has SHA256
`05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc`.

Historical public and observer profiles retain their exact versions and lock
bytes. Stored deployments resolve their original profile rather than adopting
the new default. Source regressions verify both configuration versions and
reject modified locks, unsupported tuples and replacement identities.

The published 15.16.2 schema retains the supported Site admin key and local
service fields. Its versioned access mapping binds the independently captured
schema fingerprint. The current observer translation preserves the 21-resource
inventory, token-only bootstrap and pinned observer image. Translation remains
non-executable; authenticated guest access and complete capture remain separate
requirements.

## Verification

| Check | Result |
| --- | --- |
| Shared GCloud, Platform and Terraform suites | 1,339 passed |
| Compiled runtime, lifecycle and catalog checks | 105 passed |
| GCloud and Terraform type checks | Passed |
| Three plugin runtime bundles | Passed |
| Scoped SDK dependency guard regressions | 16 passed |

The stale dependency guard now recognizes the separately qualified GCloud and
Platform SDK 23.10.13 lane. Unrelated and unqualified pins still refuse. Normal
frozen-lock installation restored missing validation dependencies without
changing manifests or locks. Earlier failures and their corrected inputs remain
retained privately. Final authored documentation and privacy checks accompany
this receipt.

## Remaining acceptance

These checks establish source and compiled behavior. Builtin original capture,
fresh original-node SSH and guest evidence, full native and Terraform networking
and lifecycle acceptance, content-verified traffic, recovery timing, cleanup
and restoration remain required. Capture, activation and publication holds
remain in place; immutable v12.3.1 assets are preserved.

[SDK PR #5176](https://github.com/f5-sales-demo/xcsh/pull/5176) merged the normal
marketplace doctor repair. A cancelled macOS runtime check has a targeted rerun
on the original commit; complete CI and published consumer acceptance remain
unproven while that check is pending. Marketplace #1559 and draft PR #1698
remain incomplete.
