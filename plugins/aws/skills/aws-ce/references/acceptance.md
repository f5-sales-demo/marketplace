# AWS CE candidate acceptance boundaries

This candidate extends the implementation tracked by marketplace #1326 and draft #1327.
It reuses their AWS, shared platform, and Terraform lifecycle modules. Candidate source,
automated tests, unpublished bundles, installed release acceptance, and live traffic acceptance
are separate evidence. Version declarations do not establish publication.

## Current contract and live qualification

The consumer pins API v12.0.9. Its AWS node-configuration contract still permits one non-HA
node. Keep three-node mutations disabled until the owning API and provider repositories publish
an evidence-backed replacement for that exact topology. Three independent sites do not qualify
one three-node HA site.

The disposable Sales Demo qualification observed three healthy registrations and six correlated
MAC/device identities. The configured preboot HA experiment did not satisfy physical-link evidence:
the site interface endpoint returned HTTP 501, and the physical site's version publications
identified Regional Edges rather than CE nodes. Preserve publisher, resource identity, freshness,
and duplication checks. Registration cannot substitute for physical-link or traffic evidence.
The disposable qualification fixtures were retired; these observations do not establish end-to-end
native or Terraform acceptance for this candidate.

Upstream physical-interface qualification is tracked in
[api-specs-enriched #1930](https://github.com/f5-sales-demo/api-specs-enriched/issues/1930).

## Remaining implementation and acceptance

- Qualify and publish authoritative CE physical-interface telemetry and exact three-node AWS
  node-configuration/provider semantics before enabling HA operations.
- Complete HA NLB listener/service binding; the existing platform ingress adapter requires
  independent one-node sites. Verify combined static TGW and NLB ingress on one HA site.
- Implement reviewed static TGW cutover and measured recovery. Existing failover execution
  covers TGW Connect; per-AZ static route rendering alone does not establish failover.
- Add whole-site service withdrawal and restoration to stop/start plans. Current EC2 power
  actions do not contain those stages. Whole-site power planning and application, including
  previously saved plans, remain gated until the coordinated lifecycle is implemented.
- Qualify rolling resize/replacement with physical health and measured traffic for both engines.
  Keep software/OS operations gated by the current supported F5 contract.
- Expand independent inventory beyond EC2 site/ownership tags and interface correlations.
  Cloud tags alone do not prove platform registration or ownership suitable for mutation.
- Exercise equivalent native and Terraform resources, traffic, failed-node detection, NLB failover,
  reviewed static cutover, interruption/resume, brownfield restoration, and final absence.
- Require native reconciliation and zero-action saved Terraform follow-up plans for the exact
  accepted deployment. Verify fresh installed-agent prompts and published immutable artifacts.

Passive Flow Log samples report scoped ACCEPT/REJECT counts from existing CloudWatch destinations.
They do not establish bidirectional application traffic, failover, or flow delivery completeness.
Unsupported destinations and missing, malformed, stale, or paginated samples remain unknown.

Keep #1327 draft and coordinate delivery through #1326/#1340. Do not create a competing
lifecycle PR, close release trackers, or claim installed/live acceptance from candidate tests.
