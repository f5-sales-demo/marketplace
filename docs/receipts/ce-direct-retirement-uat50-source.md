# CE UAT50 direct-route restoration source qualification

Implementation child of #1651 and #1326; qualification stays in draft PR #1565.

The internal AWS Terraform transition preserves the foundation and modifies only
selected routes. It binds original table snapshots to the immutable plan, records
an exact original target for each route, and requires the selected SLI ENI when
rendering the CE target. Restoration retains the five qualified provider target
spellings. State relinquishment uses `removed` with `lifecycle.destroy = false`.

Fresh read-only AWS observations check the account, both owned ENIs with their
MAC/device/subnet identities, complete selected route tables and unrelated routes,
active routes and associated subnet bindings. Two matching reads are mandatory.
Observation time is a cloud-read receipt, not an original CE sample heartbeat.

The internal retirement stage restores the original targets through an exact saved
plan, independently verifies cloud restoration, requires ordinary no-change state
and unchanged route IDs, then relinquishes state. It reobserves cloud preservation
before and after relinquishment and rejects remaining selected state resources.
Lost responses retain the pending attempt and prohibit blind replay. Durable
interrupted-attempt reconciliation remains an integration requirement.

The public AWS provider 6.63.0 source distinguishes `ROUTETABLEID_DESTINATION`
import selectors from `r-ROUTETABLEID<CRC32(destination)>` state IDs. Relinquishment
requires exact observed state IDs and hashes those IDs. Source provenance:

- [Route resource](https://github.com/hashicorp/terraform-provider-aws/blob/v6.63.0/internal/service/ec2/vpc_route.go)
- [State ID](https://github.com/hashicorp/terraform-provider-aws/blob/v6.63.0/internal/service/ec2/id.go)
- [CRC32](https://github.com/hashicorp/terraform-provider-aws/blob/v6.63.0/internal/create/hashcode.go)

Verification: initial missing-module failures, an operational blackhole regression,
six import-selector/state-ID cases and four digest-valid forged snapshot cases
failed before their implementations. Real Terraform reproduced the empty labeled-resource block failure after removal
of the last route; a regression failed before the renderer repair. Final focused
suites pass 53 tests with 89 assertions. The final broader four-plugin run passes
1765 tests with 10985 assertions. Four compiler checks/builds, manifest validation,
tracker update/check (478 assertions each), runtime assets, schema mappings and
readiness checks (8 tests / 44 assertions), staged PII and diff checks pass.
Generated import, CE-target, restoration and removal configurations validate with
Terraform 1.16.5 / AWS 6.63.0: zero errors and warnings, no cloud plan or apply.

This is source qualification only. The new stage has no public caller yet;
public brownfield mutation admission stays closed. Exact archive/installed stage
consumption, cloud preservation, SLO/SLI operational acceptance, the full live
matrix, the failed 45000 ms recovery criterion and explicit final UAT acceptance
remain open. Coordinated versions are platform 7.0.0-uat.50, AWS 3.0.0-uat.50,
Azure 5.0.0-uat.50 and Terraform 3.0.0-uat.50. No normal release or UAT delivery.
