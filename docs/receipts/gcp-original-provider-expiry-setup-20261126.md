# Original provider expiry and setup qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery remains draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.
Full issue acceptance remains incomplete.

## Original provider and cleanup

One original apply at source `7558ae8d4b71908a55a618527eef53a689cd7d26`
used Terraform 1.17.2, Google provider 8.12.0 and xcsh provider 15.17.8.
It managed three local `terraform_data` resources and zero cloud resources.
The original monotonic start and two-hour deadline were preserved throughout.

Independent review verified token renewal through the same original Google
provider after the conservative expiry boundary. The later request began
3,253 ms beyond that boundary. Token bytes changed; the principal and audience
remained the same. All 79 observation rounds retained original process and
executable identities. The largest retained identity gap was 52,337 ms,
within the original 60-second bound. Seventeen original process groups were
independently verified absent before cleanup.

The expiry review SHA-256 is
`dec66e0ccb603e11c9861d767e40bc468524b5ab77bd5c9d4f14adce84448dc5`.
The Google executable SHA-256 is
`97cc25d78bb8fc4c4cccc0672af0cc776b1175e0f0a5cd6a67ba55f0380189f0`.

Typed cleanup first verified the exact original inventory and no-change plan.
A separate independent review authorized one delete-only apply for the three
local identities. Final review verified three absences, an empty destroy plan,
stable state, two non-submitting resumes and original executor closure.
Original evidence was archived before plan reuse and remained byte-identical.
The final cleanup review SHA-256 is
`442b2ce2bf6dbed85dcca189da2a3ac0d60d60bd6946ff71d85f7e839beddcda`.

This bounded fixture qualifies same-provider expiry and local cleanup. Managed
GCP insertion, bootstrap, guest capture, routing, health and traffic remain
separate live gates. No new cloud campaign was submitted.

## Supported setup and profile preservation

A fresh supported marketplace scope installed GCloud 1.7.97, its automatic
Platform 6.3.41 dependency and explicit Terraform 2.4.196. An ordinary Ubuntu
terminal completed all three forced Terraform installation steps and all three
verification steps with exit 0. Terraform 1.17.2, observer Python 3.15 with
psutil 7.2.2 and SSH clients 10.6p2 were verified in initially absent scoped
paths. Status, doctor and both profile statuses passed.

Independent boot and original inode evidence resolved the historical empty
profile lock. Its original directory, owner inode and empty bytes were retained.
Post-setup reconciliation preserved configuration, suppression, provenance and
other profile facts; only normal account observations and collector metadata
changed. No reset, elevation, security-control change or process signal was used.
Original launcher and terminal closure were independently verified.

The relocation source repair merged in
<https://github.com/f5-sales-demo/xcsh/pull/5224>, closing #5223.
The interrupted-lock source mechanism remains tracked in
<https://github.com/f5-sales-demo/xcsh/issues/5231>. Eight new owned-lease,
retention, attribution and cancellation cases pass in a separate source scope;
recovery, broader source checks and published consumer verification remain open.

## Retained failures and attribution

The original full Terraform suite reported 1,284 passes and one distinct test
wrapper timeout. Bun printed that failure again in its summary. Its guarded
suite-start record and actual child script establish source `7558ae8d`;
the generic transport context names a different checkout. Both records remain
preserved, and transport context is not treated as subprocess source attribution.

The changed 60-second test wrapper passed its original case. Its coordinated
native case then failed because isolated Python could not import psutil.
The earlier prerequisite receipt used borrowed PYTHONPATH for ordinary imports
and six tests; it did not qualify isolated native actor startup. The failed
fixture, stderr and source scope remain retained. Fresh actual dependency and
changed-source qualification are required before delivery.

The failed terminal CRLF check and initial zombie-closure assertion also remain
retained. Corrected framing verified the six exact installed commands without
repeating setup. Natural parent reaping settled terminal closure. An independent
Mac mirror verified 1,921 recent setup, profile and delivery evidence files.

## Isolated prerequisite and source correction

Fresh copied-interpreter qualification used wheel-only project dependencies:
PyYAML 6.0.4, pytest 9.2.0 and psutil 7.2.2. Eight prerequisite cases pass,
including rejection of dependencies borrowed through PYTHONPATH. The actual
source command verifies isolated startup, dependency locations and real process
observations before native fixtures run. CI installs these same scoped versions.

Both inventory cases now pass with the qualified interpreter, including the
real original actor and final-capture baseline binding. Terraform typechecking
passes after materializing GCloud and Platform from their frozen locks. The
initial missing-module failure and subsequent lint findings remain preserved.
Original source assertions, startup deadlines and final budgets are unchanged.

Terraform 2.4.197 synchronizes the repaired wrapper with the manifest, package,
catalog and generated tracker. Historical tracker evidence is retained; source
changes reopen affected acceptance. Full driver, current-head CI and review,
published installation and original live gates remain required.

## Remaining acceptance

The original guest, networking, lifecycle, traffic, recovery and restoration
requirements remain open for both engines and both topologies. Unsupported
mappings remain explicit refusals. Required source and current-head CI/review,
draft PR repair, merge, qualified artifact publication and published user-scope
installation with ordinary Ubuntu bun dev remain required. Historical failed
captures and executor locks remain retained. Immutable v12.3.1 assets remain
unchanged.
