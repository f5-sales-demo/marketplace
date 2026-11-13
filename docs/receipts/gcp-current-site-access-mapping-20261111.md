# Current provider Site SSH configuration mapping

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
PR: <https://github.com/f5-sales-demo/marketplace/pull/1698> remains draft.

GCloud 1.7.45 recognizes the published xcsh provider 15.15.7 Site admin public-key
and SLI local-service fields. Previously the translator refused that current
provider because its access mapping accepted only 15.13.0. The current mapping
uses the same Site fields and preserves token-only VM cloud-init. Unsupported
provider versions and topologies retain explicit refusal.

The retained provider schema was pinned to xcsh 15.15.7 and Google 8.11.0. Its
SHA-256 is `f5f3daf876eb3489054cab23d68af266265ec7b1b6ec84d52117283ae70ed6e6`.
The schema declares a single `admin_user_credentials` block with optional string
`ssh_key`, and a single `blocked_services` block with list `blocked_service`.
Each service entry has string `network_type` and object `ssh`, `dns` and
`web_user_interface` fields. The sanitized test fixture retains those declarations.
See the [published provider documentation](https://registry.terraform.io/providers/f5-sales-demo/xcsh/15.15.7/docs/resources/securemesh_site_v2).

Two new tests failed before implementation: current-provider translation was
refused and its explicit mapping fingerprint matched the historical fingerprint.
All 37 focused tests then passed with 198 assertions. Historical default and
explicit 15.13.0 fingerprints remain equal; explicit 15.15.7 mappings bind their
schema identity separately. Existing lifecycle receipts are not migrated.

This qualifies configuration compatibility only. It does not establish successful
SSH, VM metadata access, host trust, guest capture, health or traffic. The default
installed capture factory, observer inventory and all original identity joins
still require implementation and live qualification. No cloud resources were
created. Full issue acceptance, review, merge, publication and installation remain
incomplete; historical evidence and v12.3.1 remain preserved.

The broader qualification passed 1,398 tests with 11,348 assertions, three
builds and typechecks, dependency, catalog and manifest checks. The first resumed
shared run omitted the qualified Python fixture and remains retained as failed;
restoring that fixture was the documented changed input before the passing run.
Earlier adapter CI exposed a separate short-uptime final-capture test defect;
its clock-fixture repair and renewed exact-head CI remain required.
