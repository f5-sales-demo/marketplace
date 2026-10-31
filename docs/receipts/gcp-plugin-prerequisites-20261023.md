# GCP plugin development prerequisites

The candidate GCloud 1.7.22, Platform 6.3.8 and Terraform 2.4.3 bundles passed
real xcsh development-host checks on 2026-10-23. This qualifies the registration,
shared-service and read-only contract paths described below. HA deployment,
operational acceptance and release publication retain their separate gates.

## Source and development runtime

The marketplace candidate extends source
`68e48cddebfb4dd261f21d555c7f658e26cc5952`. An isolated xcsh checkout used
`33d1e443d` from current `origin/main`, version 23.9.5. The required Bun 1.4.2
frozen-lock bootstrap and source-matched native preparation passed. Shared
checkouts and historical campaign executors were preserved.

The normal `bun dev -- --mode rpc --no-session --no-memories` entry point loaded
the candidate directories with supported `--plugin-dir` options. An observer
extension verified required GCP and Platform tool registration and both shared
Platform/Terraform services. RPC state and skill enumeration succeeded, including
`gcloud:gcp-ce`. A separate real `createAgentSession` exercised the registered
xcsh tool wrappers; it supplied no replacement PluginInterface or mocked fetch.

The fixed scenarios established:

- Invalid project syntax returns a structured nonmutation refusal through
  xcsh's `AgentToolError` boundary.
- Authenticated public reads verify the base contract, operational profile,
  qualification and Terraform HA lifecycle pins.
- Credential rotation to an invalid credential fails without retaining a prior
  qualification or retrying anonymously.

No model requests or cloud mutations were made. These checks do not establish
interactive rendering, a live GCP deployment or CE guest SSH access.

## Cleanup transport repair and validation

Anonymous GitHub core quota exhaustion previously caused a cleanup contract
read to return HTTP 403 before mutation. Both public GCP resolver defaults now
support standard `GH_TOKEN`/`GITHUB_TOKEN` environment credentials. Authentication
is limited to fixed pinned metadata GETs in the owning repository, forbids
redirects, preserves caller cancellation and has a sixty-second bound. Release
assets remain anonymous with unchanged digest verification. Expired credentials
remain failures; no success cache or anonymous fallback was added.

Failing-first transport tests exposed five behavioral failures, followed by a
separate inherited-Request-body failure. The repaired focused tests passed.
Validation also passed 555 lifecycle tests across 102 files, 76 shared checks,
Platform and focused GCloud typechecks, three runtime builds, catalog consistency,
dependency checks and scoped lint/privacy checks. The initial lifecycle run
during native compilation retained six failures and four errors; the subsequent
run after compilation passed with a thirty-second test-harness timeout.
Production command, freshness and observation deadlines were unchanged.

The Ubuntu delivery host also passed a bounded authenticated read of the explicit
GCP project's active identity. A read-only lookup froze the ready x86-64 observer
image `ubuntu-2404-noble-amd64-v20261021`, numeric ID `4996011480491275419`, in
`ubuntu-os-cloud`. This creates no observer or CE resources and grants no campaign
submission authorization.

Private receipts retain separate stdout/stderr, exit status, timestamps, sizes,
truncation flags and SHA-256 identities. The real runtime's initial probe failure
was retained before correcting its expected-error handling. GitHub credentials
were checked absent from retained files. A task-owned OAuth cache created by the
normal development preload was removed. Artifact privacy exceptions are limited
to exact independently verified checksum lines; no source rule was weakened.

| Bundle | SHA-256 |
| --- | --- |
| GCloud | `aa306f9d31b7a79441d8b3de271cbf7fc1d2759a0a8d24c5cf7173f2c8fd5ea0` |
| Platform | `94bbb65784878eb0f60663c0ae26374053b355752eb0670290a3ef85c547eab0` |
| Terraform | `25a6fbc7d535fc1bf15bb35376ea595552c43d6a33072ae9cc2181913f85090d` |

## Remaining acceptance gates

PR #1698 remains draft until its source and live acceptance requirements pass.
The existing success03/04/05 campaign allowance is exhausted; each campaign was
independently cleaned. Do not replay their executors or launch a fourth campaign
under that allowance. A revised live campaign requires a fresh reviewed scope,
current credentials, source/executable binding and independently reviewed plans.

The offline guest collector and host-trust tests passed separately. Live access
still requires numeric-original-VM-bound host fingerprints, supported admin Site
CLI access and retained bootstrap-period VPM/container logs. Any observer-based
campaign must freeze its exact Ubuntu image and account for all 21 resources,
including independent initial absence and final cleanup checks. Offline fixtures
and registration success do not replace that evidence.

q12 is closed as presumed transient with its exact cause unknown. Later campaigns
do not retroactively establish that cause. v12.3.1 assets remain immutable and are
not republished. Coverage remains 36 placement profiles, 24 component services,
30 runtime services and zero exclusions. Traffic, failover, quorum, native HA,
networking parity and upgrades retain their own implementation and acceptance
requirements in issue #1559.
