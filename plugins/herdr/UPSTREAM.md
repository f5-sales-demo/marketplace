# Upstream provenance — herdr skill

`skills/herdr/SKILL.md` is vendored **verbatim** from the Herdr project. Do not edit it here; change
it upstream and re-vendor, otherwise `herdr-skill-freshness.yml` will fail.

| Field | Value |
| --- | --- |
| Upstream repository | <https://github.com/ogulcancelik/herdr> |
| Upstream path | `SKILL.md` (repository root) |
| Pinned ref | `master` |
| Vendored commit | `81f355fadac7d0d45b077dfc28f9f679add6bbb6` |
| Last upstream change to `SKILL.md` | `0f161fac287011b3e216383e2b8482f049fd6a7b` (2026-07-21) |
| SHA-256 of vendored file | `0786182f02ebf92708e09d82d79e4614d1a9c30bfc337643cc2af1d0fb9db29f` |
| Size | 10140 bytes |
| Retrieved | 2026-07-28 |
| Upstream license | Apache-2.0 |

## Attribution

Herdr is licensed under the Apache License 2.0 (see the upstream `LICENSE`). This plugin
redistributes `SKILL.md` unmodified under those terms. Copyright remains with the Herdr authors.

## Re-vendoring procedure

```bash
curl -fsSL https://raw.githubusercontent.com/ogulcancelik/herdr/master/SKILL.md \
  -o plugins/herdr/skills/herdr/SKILL.md
shasum -a 256 plugins/herdr/skills/herdr/SKILL.md   # update the table above
scripts/bump-version.sh herdr patch                 # keeps catalog + plugin.json in lockstep
```

Update **Vendored commit**, **SHA-256**, **Size**, and **Retrieved** in the table when you do this.
The freshness workflow compares the live upstream file against the vendored copy, so a stale table
with a correct file still passes — but the table is the human record of what was reviewed.
