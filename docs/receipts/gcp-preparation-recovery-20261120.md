# GCP Terraform preparation recovery

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Draft delivery: <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The ordinary Ubuntu home routes to a canonical Google ADC file through a config
directory alias. Installed preparation previously rejected that default route
before creating its runner directory. The stored input receipts then required
a resume, which could not open the absent runner directory.

Default ADC discovery now resolves the configured home route before binding the
original file. Explicit credential paths retain their strict canonical-file
checks. A matching preparation can initialize an absent runner directory only
with the original owner and input receipts and no execution or authorization
records. Missing, linked, unsafe or changed records refuse recovery. Existing
runner directories keep their original resume path; exclusive creation prevents
overwriting a concurrent preparation. Historical receipts are preserved.

Failing-first boundary cases reproduced acceptance of missing and linked records.
Recovery tests cover changed records, authorization, owner and runner failures,
configured ADC aliases, explicit aliases, unsafe credentials, concurrent resumes
and immutable input receipts. Focused and shared runtime checks, three
typechecks, runtime bundles, catalog and presentation tracker checks pass.
An existing public-runtime mock now represents the runner directory that the
real service creates. Its failed broad-suite evidence remains retained.
All 549 GCloud, 839 Terraform and 303 Platform cases pass, with 8,356 assertions.

A fresh source-path plan resumes the original disposable HA preparation with
Terraform 1.17.2, Google 8.12.0 and XC 15.17.6. It contains exactly 21 creates:
18 CE resources plus observer VM, disk and SSH firewall. Separate official
Terraform parsing verifies the saved binary plan, resource identities, two CE
interfaces, separate CE/observer tags, narrowly scoped observer SSH and no
observer service account. Independent authenticated GETs confirm all 21
resources are absent.

The retained F5 GCP guide explicitly requires tag-scoped allow-all CE ingress and
egress rules. The saved plan matches that mapping. Existing campaign keys,
token-only bootstrap and pinned CE/observer images retain their original scope.

Ubuntu lacked the retained corporate-funding policy. Its unchanged bytes were
transferred into private acceptance storage; billing settings were not changed.
A subsequent funding read failed, while separate direct and production-wrapper
reads succeeded. The exact cause remains unknown. The next plan completed with
fresh funding evidence. Original failures, private output and executable/source
hashes remain preserved without overwriting prior records.

GCloud is 1.7.62; Terraform is 2.4.136; Platform remains 6.3.30. The stale tracker
failure from the preceding PR head is retained. Tracker regeneration follows
explicit version bumps and final plugin bytes.

No apply was submitted. Default apply still refuses the unqualified capture
controller. These are source and preparation checks; original guest capture,
V2 renewal/callback/default factory, ordinary installed Ubuntu execution, full
native/Terraform networking and lifecycle, content traffic, recovery,
restoration, independent teardown, parent review/CI/merge and qualified
publication/installation remain open. Immutable v12.3.1 is unchanged.
