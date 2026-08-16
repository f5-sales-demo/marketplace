# Upstream provenance — herdr skill

`skills/herdr/SKILL.md` is vendored **verbatim** from the Herdr project. Do not edit it here; change
it upstream and re-vendor, otherwise `herdr-skill-freshness.yml` will fail.

The marketplace registers this vendored skill under the canonical URI
`skill://herdr:herdr`. Keep integration metadata here rather than adding it to the upstream file.

| Field | Value |
| --- | --- |
| Upstream repository | <https://github.com/herdrdev/herdr> |
| Upstream path | `skills/herdr/SKILL.md` |
| Pinned ref | `master` |
| Vendored commit | `51b7064ef0a02642393bab1d2eea0f4dbd8414d2` |
| Last upstream change to `SKILL.md` | `51b7064ef0a02642393bab1d2eea0f4dbd8414d2` (2026-08-15) |
| SHA-256 of vendored file | `0786182f02ebf92708e09d82d79e4614d1a9c30bfc337643cc2af1d0fb9db29f` |
| Size | 10140 bytes |
| Retrieved | 2026-08-16 |
| Upstream license | Apache-2.0 |

## Attribution

Herdr is licensed under the Apache License 2.0 (see the upstream `LICENSE`). This plugin
redistributes `SKILL.md` unmodified under those terms. Copyright remains with the Herdr authors.

## Re-vendoring procedure

```bash
curl -fsSL https://raw.githubusercontent.com/herdrdev/herdr/master/skills/herdr/SKILL.md \
  -o plugins/herdr/skills/herdr/SKILL.md
shasum -a 256 plugins/herdr/skills/herdr/SKILL.md   # update the table above
scripts/bump-version.sh herdr patch                 # keeps catalog + plugin.json in lockstep
```

Update **Vendored commit**, **SHA-256**, **Size**, and **Retrieved** in the table when you do this.
The freshness workflow compares the live upstream file against the vendored copy, so a stale table
with a correct file still passes — but the table is the human record of what was reviewed.
