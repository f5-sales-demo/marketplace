# Installed original GCP guest worker adapter

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
PR: <https://github.com/f5-sales-demo/marketplace/pull/1698> remains draft.

Terraform source version 2.4.79 adds an installed-source worker adapter with one
retained signal-free execution. It freezes the original context, binding, inputs
and guards before asynchronous admission; requires all eight shipped script pins;
and binds the original kernel and SDK process identity before releasing the worker.
Private requests, owned FIFOs and executor completion retain separate attribution.
Later completion evidence does not rewrite an initial failed capture.

Five hermetic adapter tests passed. The retained broader qualification passed
1,396 tests with 11,330 assertions, three builds and typechecks, formatting, lint,
dependencies, catalog, manifests and tracker checks. A direct Bun script outside
the test runner independently verified original source-worker refusal and closure.
The preserved Bun test-runner attempts reported automatic dangling-process cleanup
and remain unqualified. The reason a passing test retained a dangling process is
unresolved; the CI adapter tests do not start subprocesses.

This evidence does not qualify GCP SSH access, guest capture, ordinary installed
`bun dev`, deployment, health, traffic, lifecycle behavior or publication.
The default capture factory remains unconnected. Original provider, numeric VM,
bootstrap token, NIC, insert, audit and serial joins plus complete VPM and container
evidence remain prerequisites. Native and Terraform live acceptance, cleanup and
restoration, required review, merge, publication and published installation remain
open. Historical failures, locks, frozen collectors and v12.3.1 are preserved.
