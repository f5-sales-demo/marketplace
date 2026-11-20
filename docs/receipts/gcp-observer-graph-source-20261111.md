# GCP Terraform observer graph source qualification

Issue: #1559. Delivery: draft PR #1698.

The new candidate translator includes the observer VM, separately owned boot disk
and SSH firewall in the original reviewed graph. Its inventory contains all
18 CE resources and three observer resources. The legacy translator and stored
cleanup paths retain their original configuration.

The observer uses the existing SLI network, a distinct campaign public key and
one canonical IPv4 /32 SSH source. Its firewall allows TCP22 only to its own tag.
The VM has no service-account block, cannot forward packets, ignores project SSH
keys and retains its independently owned disk for partial-create cleanup. CE
cloud-init remains token-only; CE admin access stays on the documented Site key
mapping.

The image name is `ubuntu-2404-noble-amd64-v20261021`. A Terraform resource
precondition requires numeric image ID `4996011480491275419` and READY status.
The verified Google 8.11.0 schema supports the image data-source fields. This
candidate admits only Terraform 1.17.2, Google 8.11.0 and xcsh 15.15.7.

Failing-first observer tests cover the complete inventory, exact image pin,
separate disk, unchanged CE configuration, restricted SSH, malformed keys and
addresses, collisions, wrong engines, topology and provider tuples. Focused
compute/access/observer regressions pass. The existing key validator already
rejects line terminators; the new probe required no implementation change.
The full shared and canonical suite passes 1,429 tests with 11,565 assertions.
Three native typechecks and runtime builds pass. The actual Terraform/provider
configuration validates without errors or warnings using synthetic fixture
identities; it submitted no managed cloud operation.

The translator remains a source candidate. Public deployment dispatch does not
select it yet. Its owned observer cleanup, original numeric identities, pinned
SSH trust, same-runner capture projection and default installed capture must be
integrated and qualified before a managed campaign. Source validation does not
establish authenticated guest access or live CE acceptance.

An independently reviewed local-only campaign separately verified refresh across
expiry with Terraform 1.17.2 through the same original Google provider process.
Three local resources were removed through a reviewed typed destroy; absences,
empty destroy, stable state and two non-submitting resumes passed. This evidence
does not qualify managed VM insertion or guest capture.

Full native/Terraform networking and lifecycle acceptance, content-verified
traffic and recovery timing, ordinary installed Ubuntu `bun dev`, review, CI,
merge, publication and published installation remain open. Historical evidence,
publication holds and immutable v12.3.1 assets remain preserved. The previously
observed TypeScript 5.9 SDK discrepancy also remains tracked independently of the
passing native compiler checks.
