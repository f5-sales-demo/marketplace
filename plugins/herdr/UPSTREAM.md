# Upstream provenance — Herdr integration assets

The complete `skills/herdr` directory is vendored verbatim from the maintained F5 fork. Do not edit
those five files here; change them upstream and re-vendor the directory, otherwise
`herdr-skill-freshness.yml` will fail. The marketplace registers it under `skill://herdr:herdr`.

The hardened Windows installer is also vendored verbatim. The xcsh wrapper resolves and verifies the
stable package first, then invokes this installer through its local-package mode so activation stays
versioned and atomic.

| Field | Value |
| --- | --- |
| Upstream repository | <https://github.com/f5-sales-demo/herdr> |
| Upstream branch | `build-xcsh` |
| Reviewed commit | `993f928f20a1b9d1dad8afd737ee29e5917f4097` |
| Skill path | `skills/herdr` |
| Skill inventory | `SKILL.md`, `references/agents.md`, `references/automation.md`, `references/external-workers.md`, `references/remote-and-persistence.md` |
| Skill bytes | 21,524 |
| Windows installer path | `distribution/install.ps1` |
| Windows installer SHA-256 | `af585770c482623d8e7526a3fd1ee9d07fc85c780fddee0f60b187717565e35b` |
| Retrieved | 2026-09-22 |
| Upstream license | Apache-2.0 |

## Vendored skill checksums

| Path | SHA-256 |
| --- | --- |
| `SKILL.md` | `50fcd8a907a313d76646b2f2519903b2ecc58194b3acb84448ea16c3d50c90c0` |
| `references/agents.md` | `c073c3b87353e01541f16ad1e1c9bc914ed1982f1231caf0a1ebaf491a67baf7` |
| `references/automation.md` | `ef76ba05aad2046408925764fb3b08397960880876dea05b50bfc2c389879770` |
| `references/external-workers.md` | `ca4c2c2c8a1d04ef69f30819dcc451d0dfad4d95007361ee45f9795f58a1935c` |
| `references/remote-and-persistence.md` | `1bf7a119070573ac706e5e4ee4b7262b92bc31c17b474d01bb506024c4812a0a` |

## Re-vendoring procedure

Fetch the complete `skills/herdr` tree and `distribution/install.ps1` from a reviewed
`f5-sales-demo/herdr` commit, verify its inventory and hashes, update this record, and run:

```bash
bun test plugins/herdr/test
scripts/bump-version.sh herdr patch
```

Freshness CI compares the complete vendored skill directory—not only `SKILL.md`—against the fork's
live `build-xcsh` branch and detects edits, additions, and deletions.
