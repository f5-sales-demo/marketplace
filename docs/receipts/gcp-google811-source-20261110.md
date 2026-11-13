# Latest Google provider 8.11 qualification

Issue: #1559. Delivery: draft PR #1698.

Fresh registry checks identify Google 8.11.0 as the latest stable provider.
Terraform remains 1.17.1 and xcsh remains 15.15.7. Linux AMD64 and Darwin ARM64
archives were verified against registry digests and signed checksum files using
the previously trusted HashiCorp signing key. Standard init, platform lock,
validate and provider schema checks passed.

New deployment defaults select the new exact tuple and lock. The prior Google
8.10.0 / xcsh 15.15.7 profile remains immutable and resolvable alongside earlier
profiles. Stored deployments never migrate providers or rewrite receipts.

The installed process reader now selects its Google family from both original
Terraform and Google executable hashes. A shared Terraform binary alone cannot
select a different Google family. Google 8.11 uses the explicit version4 window;
8.10 and legacy 8.7 retain their original meanings.

The first source check refused before executor startup because the request-reason
mapping had not admitted 8.11. That failure is preserved. Its disposition verified
no executor submission, state or cloud mutation. The authenticated 8.11 provider
schema confirms request_reason support. A failing-first test then qualified the
exact new mapping without admitting unknown versions.

The changed source campaign passed with 9,744 original records, two providers and
six RPCs. Original executor, provider, FIFO and RPC evidence joined across two
windows. No-change planning, typed local teardown, empty destroy and two
non-submitting resumes passed. Independent inspection verified 28 absent process
groups, empty stable state and no unresolved current capture locks. No managed
cloud resource changed.

Focused source profile/reader regressions and 53 Python provider regressions pass.
Ruff, Mypy and configured Pylint (10.00) pass, as do three native typechecks/builds.
All 1,350 shared and canonical tests pass with 34,008 assertions. Dependency,
manifest, source lint and staged privacy checks pass. New-head CI remains required.

This qualifies the new artifacts and bounded original provider read. Full
managed-insert mapping, bootstrap ownership, default installed capture, refresh
across actual expiry, CE lifecycle/network/traffic acceptance and delivery remain
open. The 8.10-only insert body consumer remains an explicit refusal for 8.11
until its supported mapping is qualified.
