# Current GCP provider expiry and installed smoke

Issue: #1559. Full feature acceptance remains incomplete.

A fresh local-only Terraform 1.17.2 fixture verified token refresh through the
same original Google 8.11.0 provider after conservative token expiry. The saved
lock also contained xcsh 15.16.2; this fixture did not exercise its CE creation
mapping. Independent review verified changed token bytes, unchanged principal
and audience, 79 retained rounds, final capture and original process closure.
The original two-hour budget remained unchanged.

Independent cleanup reviewed exactly three local deletes. All three local
resources are absent; the final destroy is empty and state is stable. Two resumes
submitted nothing. Final review repeated 56 closure checks and verified the
original evidence archive. No GCP CE resources were created by this fixture.

Normal marketplace installation in an isolated project scope installed GCloud
1.7.51 and automatically installed Platform 6.3.22. Terraform 2.4.87 installed
separately. Runtime entrypoints, manifests, the CE skill and shipped Python
scripts matched retained snapshot hashes.

Ordinary Ubuntu `bun dev` used xcsh 23.10.13 source at
`a433d692bbe704c1f55afb0564a6d86e5c6ad07a`, Bun 1.4.4, frozen-lock dependencies
and its source-matched native addon. It executed the registered project identity
tool, selected the GCP CE skill, explained native-default readiness and retained
explicit Terraform selection while reporting unavailable HA, upgrade and
failover paths. Its complete private session contains 64 records. It exited
normally; user configuration files remained unchanged.

Status reported all three integrations ready with the complete existing-context
environment. That status alone does not establish F5 API authentication or CE
health. Doctor exposed a pre-existing legacy-only diagnostic gap, tracked in
[xcsh #5175](https://github.com/f5-sales-demo/xcsh/issues/5175). It remains an unmet
installation gate. Upgrade returned success; changed-artifact upgrade,
enable/disable/removal and authentication-failure acceptance remain required.

Current-provider packaging, builtin capture composition, full original GCP guest,
networking, lifecycle, traffic, recovery and restoration acceptance, required
review and CI, merge, publication and verified user installation remain open.
Historical profiles, failed evidence, locks and immutable assets remain preserved.
