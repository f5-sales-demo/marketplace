<!-- markdownlint-disable MD013 MD060 -->
# GCP issue 1559 acceptance matrix

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Delivery: draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.

This continuation starts from candidate `66d48b9314cf6c6224078122e298b54821706920` and fetched main `687541f9`. The candidate has been reconciled in a fresh issue worktree. Full issue acceptance remains incomplete. Historical successes are attributed to their original receipts; they do not qualify this changed candidate.

Five diagnostic campaigns have been submitted. The user removed the numerical campaign cap; cloud budget is not a campaign-count gate. q28 closed without submission. [q29](gcp-q29-disposable-diagnostic-20261025.md) completed independently verified cleanup after a guest-session deadline refusal. Historical preparation sections retain their original versions, counts and evidence attribution; those statements do not describe current authorization.

The [session construction qualification](gcp-session-boundary-offline-20261026.md)
passes 30 current regressions, including actual routed PTY classes with explicit
local children. It preserves both ownership checks and the frozen 15-second SSH
prompt within a 60-second complete construction operation. The fresh source
also replaces one synthetic URL test literal; its credential refusal behavior
passes. Historical installed bytes remain preserved, and this successor still
requires a fresh installed snapshot and live GCP guest evidence.

## Current implementation and verification

GCloud 1.7.25 declares Platform as its required marketplace and integration setup dependency. The current Platform manifest is 6.3.9. Terraform remains optional. Public Terraform paths request the installed shared runner before opening deployment storage; missing installation returns `terraform_setup_required` with installation and setup commands. The historical session helper retains its original optional runner behavior for stored executors.

Every declared operation appears in the plan/apply schema. Operations without qualified consumer mappings return a schema-v2 refusal with their owning engine, exact requested operation and unmet mapping, reviewed-plan, identity and restoration requirements before cloud reads. Upgrade and failover aliases use that same refusal boundary. This exposes availability; it does not implement those mutations.

The schema-v2 recovery result measures failover from disruption start and repair from restoration-command start. Action completion cannot reset the clock. Route recovery, content-verified application recovery, outage duration and loss remain separate. The 120-second boundary is inclusive; missing traffic, content mismatch and a later failed observation invalidate recovery. Historical receipts and stored deployment intents are not rewritten.

Failing-first dependency, dispatch, optional Terraform and timing regressions were retained privately before repair. Validation passed 561 lifecycle tests across 102 files and 75 shared/runtime/tracker tests, plus Platform, Terraform and focused GCloud typechecks, three runtime builds, catalog and lifecycle checks. The resolved merge passes pre-commit, changed JS/TS/JSON Biome (warnings retained), catalog consistency, staged Gitleaks and staged PII enforcement. The first hook run exposed catalog formatting; the catalog was formatted and the corrected run passed without changing its generated content.

## Installation and normal development runtime

The staging catalog is named `issue-1559-acceptance-staging`. It contains frozen plugin snapshots and is installed through the supported marketplace CLI into an isolated acceptance profile. GCloud installation also installed Platform; Terraform was initially absent. Qualified marketplace IDs passed disable, enable and upgrade. A second upgrade consumed a changed runtime snapshot. Initial attempts using bare IDs failed and were preserved; the CLI requires `name@marketplace` for those marketplace operations.

Source-matched xcsh `33d1e443da267361b1be4af8936941b82a57198c`, Bun 1.4.2 and its existing native build were used. Ordinary `bun dev` loaded installed plugins without `--plugin-dir`, adapter replacement or fetch replacement. With the existing saved context, GCloud and Platform reported ready. Interactive setup reported ready with no setup required. The noninteractive `--json` setup attempt correctly refused the human-only interface.

The configured `gpt-6.1-sol` model selected the installed GCP skill and executed registered wrapped `gcp_ce_upgrade` and `gcp_ce_failover` tools in separate ordinary RPC sessions. Results retained native default and explicit Terraform respectively, refused the unqualified operation and reported `mutationAttempted=false`. A 120-by-40 ordinary interactive terminal capture rendered the actual upgrade refusal and its unavailable state without truncation. This is a bounded rendering check, not full visual acceptance. A separate configured-model session executed registered `gcp_compute_discover` with an isolated unauthenticated GCloud configuration. Independent `gcloud auth list` returned zero accounts; the tool returned `validation_or_read_failed` and `mutationAttempted=false`, preserving the generic failure rather than inventing an authentication diagnosis. Doctor found the plugins directory and retained package-manifest/node_modules warnings. Supported `plugin uninstall` removed the three staging plugins; final list verified removal. The unsupported `plugin remove` attempt is retained. Raw model and terminal transcripts remain private.

## Requirement matrix

Fresh authenticated installed discovery now passes in an ordinary configured-model
RPC session. The installed GCP skill selected exactly one registered discovery
call for the explicit project and region. Five read-only receipts and matching
rendered data returned 14 F5 image candidates, 763 regional machine-type entries,
113 quota entries and 58 enabled APIs, with billing enabled. IAM, organization
policy, capacity, NIC limits and license acceptance remain unknown. All 485
installed files were retained before supported isolated removal. This qualifies
discovery only; no guest or infrastructure operation was submitted.

Network-change classification now retains schema-v2 interface deltas, explicitly
refuses unqualified internal CE role/VRF remapping and requires original NIC/private
IP allocation and restoration review for network/subnet changes. Google's current
[interface update reference](https://docs.cloud.google.com/sdk/gcloud/reference/compute/instances/network-interfaces/update)
supports network/subnet changes and documents possible private IP reassignment.
The [multi-NIC reference](https://docs.cloud.google.com/vpc/docs/multiple-interfaces-concepts)
does not qualify CE guest remapping. Five failing-first cases pass after repair;
SLO replacement priority and existing engine/ownership refusal remain intact.
These planner receipts remain nonexecutable, and historical receipts are preserved.

A retained hermetic run exposed two Terraform test fixtures whose successful
subprocess paths exceeded their one-second budgets. Their success budgets are
now separate from deliberately short deadline assertions; output limits,
cancellation and the dedicated apply deadline remain tested. Production timing
policy is unchanged. The original failure remains private.

| ID | Issue requirement | Implementation and tests | Installed behavior | Fresh live evidence | Publication status / remaining gate |
| --- | --- | --- | --- | --- | --- |
| 1 | Qualified site/bootstrap/registration/interface/health/routing/upgrade mappings and immutable API/policy binding | Existing pinned contract and ownership tests pass; broader routing/upgrade mappings remain unqualified | Installed skill and operation refusals exercised | Historical narrow boot/health receipts only | v12.1.3/v12.3.1 preserved; qualify missing mappings upstream before enabling consumers |
| 2 | Skill, identity/discovery/inventory, versioned topology, plan/evidence and scoped tools | Existing schema-v1 topology preserved; all operations exposed with schema-v2 refusal evidence | Skill selection and real registered tool execution pass | q27 diagnostic provisioning and cleanup; guest capture failed before CE acceptance | Complete operation-specific executable intents and evidence before claiming parity |
| 3 | Restricted shared storage, authorization, checkpoints and Terraform runner | Existing suites pass; public path now uses the installed shared runner | Required Platform installed; optional Terraform prerequisite retained | One reviewed diagnostic create and delete-only cleanup; installed apply remains open | Qualify operational mutation dispatch and installed saved-plan execution |
| 4 | Async reconciliation, exact ownership, one-use bootstrap, engine persistence and restoration | Existing focused/shared tests cover narrow native/Terraform paths | Engine selection preserved in real model results | Historical narrow reconciliation/cleanup retained | Native HA and expanded recovery remain unqualified |
| 5 | Exact image/license, funding/APIs/IAM/org policy/quotas, sizing and homogeneous one/three-node NIC/VRF topology | Existing validation and prerequisite tests pass | Existing authenticated context reports ready | q27 fresh prerequisites, 21-resource provisioning and four original VM insert identities; capacity remains unreserved | Recheck exact billable plan and IT-funded association before each newly authorized campaign |
| 6 | External IP, Cloud NAT and explicit firewall/proxy egress | Narrow external-IP implementation; candidate NAT/firewall planners | Explicit unsupported paths retained | No fresh profile traffic | Qualify every requested profile on each engine |
| 7 | Static insertion, separate ILB ingress/next-hop routing and supported NCC/Cloud Router BGP | Candidate planners do not grant execution admission | Unqualified operations refuse before cloud reads | No effective-route/BGP/return-path proof | Missing qualified F5 mappings and consumer execution/traffic evidence |
| 8 | Verified CE-interface backend binding and symmetric content traffic | Interface/identity tests and narrow observation implementation | No traffic acceptance claim | None | Disposable clients/origins, health/backend joins and independent route/traffic receipts required |
| 9 | Software/OS upgrades, coupled replacement, targeted repair, reviewed failover and owned networking restoration | Explicit operation refusals; candidate power/replacement/restoration helpers | Upgrade/failover unavailable behavior exercised | None | Current supported targets, qualified mappings, durable execution and full live qualification required |
| 10 | Recovery within 120 seconds with separate route/application/loss/convergence facts | Failing-first clock regressions repaired; delayed completion, exact boundary, late recovery, transient success and missing content tested | Source evaluator only | None | Measure each live disruption and restoration-command start independently |
| 11 | Focused/shared tests, builds, catalog/dependencies, lint/privacy and real prompts | Current suites/builds/typechecks/catalog pass | Normal install/status/enable/disable/upgrade, configured-model skill/tool prompts pass | No cloud mutations in runtime probes | Generic unauthenticated discovery refusal and isolated removal pass; finish precise authentication classification, doctor warnings and published artifact smoke gates |
| 12 | Fresh original-bound guest capture and Terraform HA acceptance | Historical process and Python/Bun bridge qualification preserved; nine failing-first session-boundary and closure regressions pass | No private PluginInterface used for runtime acceptance | q29 created and independently cleaned 21 resources; four original numeric VM identities captured; first CE session refused before SSH child creation | No numerical campaign cap; qualify the changed session boundary and fresh reviewed successor; both guest mappings remain held |
| 13 | Both engines, single/HA, lifecycle and interruption campaigns; final reconciliation/no-change/typed teardown/absences | Existing narrow engine and cleanup code/tests preserved | Changed candidate not live qualified | None for this continuation | Full resource inventories, reviews, content traffic, final state and restoration evidence required |
| 14 | Review/CI/merge, immutable new publication, published user-scope installation and cleanup | Conflicts reconciled; source acceptance receipt maintained | Isolated staging only | No publication or final user-scope installation | Keep PR draft; required review/CI, live gates, release and downloaded artifact acceptance remain |

The balanced-disk preflight now checks `SSD_TOTAL_GB`, with failing-first cases for exhausted standard quota and missing, duplicate or insufficient SSD quota. The shared Terraform runner accepts a minimal empty-state summary only when the stable raw state proves the pinned version, zero resources and zero outputs. These source repairs preserve original source and executor evidence; publication and changed-candidate installation remain open.

## Guest campaign boundary

The original three-campaign allowance covered q24, q25 and q26. The user then authorized q27 and subsequently removed the numerical cap. q29 is the fifth submitted campaign; q28's unused plan remains sealed and must never be submitted. The [q29 diagnostic receipt](gcp-q29-disposable-diagnostic-20261025.md) records the first-session deadline failure and independently completed cleanup. Continue changed successors within the existing task authorization, with fresh scope, executable bindings, current prerequisites and independent plan review. Complete cleanup before another campaign. No historical launcher, plan or authorization may be replayed.

The [offline process-completion receipt](gcp-process-completion-offline-20261025.md) qualifies the concrete separate transport and native identity-reader change after q27. The final full collector suite passes 464 tests with zero skips; the actual Python/Bun bridge passes 44 tests. All 24,324 sealed q27 files and 485 qualified plugin files remain unchanged. Selected lint retains inherited findings, and required private route/path findings remain private enforcement failures. Neither result qualifies live guest behavior or clears either mapping hold.

The new private collector launches real nested SSH with strict original-bound host trust, campaign-only keys, disabled forwarding, bounded PTY handling and durable partial receipts. Frozen v7, host-trust and v6 dependency bytes are now verified before loading and again at session validation. Capture requires fresh original runtime listings, listing-bound container IDs, retained inspections and logs for bootstrap, VPM and exited containers. The 34-test offline suite and isolated Ruff E4/E7/E9/F checks pass; this does not constitute fleet strict Python lint or live capture qualification. Its independent ownership verifier and fresh serial receipts remain prerequisites for live execution. Capture cannot pass from completeness booleans alone: retained original-attributed journal/container files and their hashes are required, and journal timestamps must cover the required bootstrap interval. Missing or truncated evidence fails closed. A real SSH/authenticated guest session is still unverified.

A campaign must freeze observer image `ubuntu-2404-noble-amd64-v20261021`, numeric ID `4996011480491275419`, and give the observer no cloud service account. Review all 21 original resources, initial absences and the saved create plan; start capture before the single apply. Finish every outcome with the separate five-minute final-capture window, reviewed cleanup, 21 independent absences, empty destroy, stable state and two non-submitting resumes. Preserve unresolved executor locks. Do not submit an unchanged retry.

q12 remains closed as presumed transient, with its exact cause unknown. No historical qualification verdict, collector or immutable v12.3.1 asset is changed. Coverage stays at 36 placement profiles, 24 component services, 30 runtime services and zero exclusions.

## Documented Site access candidate

The following preparation and source-qualification sections are historical receipts. Their stated versions, campaign counts and pending steps belong to the recorded stage. Use the current campaign boundary above and the linked q27/process-completion receipts for continuation.

The [Secure Mesh GCP guide](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-gcp-clickops) links token-only CE bootstrap to [Create Secure Mesh Site v2](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/create-secure-mesh-site-v2). These document Site-level `admin_user_credentials.ssh_key`, with local services enabled for the chosen network. The published XC 15.13.0 provider binary was independently initialized using Terraform 1.16.6; its fresh schema confirms access as `admin` and per-VRF SSH/DNS/web UI blocking. The complete generated candidate validates with Google 8.7.0 and XC 15.13.0, with zero errors or warnings.

GCloud 1.7.24 and Platform 6.3.9 add optional `initialAccess` schema version 1, profile `site-ssh-sli`. The two-interface, external-IP Terraform HA candidate binds one canonical Ed25519 public key without options or comments. It blocks SSH on SLO, permits SSH on SLI, and blocks local DNS and web UI on both. No CE VM metadata key, password, guest shell account or serial-login fallback is introduced. Unsupported engines/topologies/provider versions refuse; omitted access preserves historical configuration bytes and lifecycle fingerprints. Changed keys change intent, generated configuration and lifecycle bindings, invalidating saved authorization.

Failing-first tests cover translation, wrong engine, malformed wire keys, high-bit algorithm bytes, injected key options, legacy fingerprints and cleanup without health. The exact-byte regression initially failed and was retained before correction. The focused suite passes 41 tests; the broader GCloud/Platform/Terraform suites pass 735 tests. Platform strict typecheck, runtime bundles, dependency and generated-catalog checks pass. The frozen 34-test private v8 collector suite also passes. These are source and offline evidence, not proof of authenticated guest access.

Private preparation accounts for 18 CE resources plus observer VM, separately owned disk and narrowly scoped SSH firewall. Four failing-first preparation tests pass, checking all 21 objects, Site-level CE credentials, token-only CE metadata, distinct campaign keys, observer image pin, no configured service account, disabled IP forwarding and a single `/32` SSH source. The preparer has no submission entry point. Before apply, independent live checks must verify that the observer has no service account, all original numeric identities, 21 initial absences, the saved plan and capture readiness. No campaign has been submitted; all three first-stage allowances remain unused. Authenticated guest access, complete attributed bootstrap journals/container logs, HA health/traffic, independently reviewed cleanup and the broader issue gates remain open.

## Durable diagnostic continuation

All applicable CI checks passed for `6526957aded79d6b7c2911c64dbdb1d0400c3f08`; PR #1698 remains open and draft. Independent source comparison confirms that only CHANGELOG wrapping differs from the saved-plan implementation head `033b1ca8`. The original plan, prior failed CI evidence and runtime bytes remain preserved.

New private v9 diagnostic helpers pass 39 offline tests for exclusive campaign writers, durable hash chains, one-use submission claims, interrupted submission without replay, original insert identities, complete serial offsets, token expiry and replacement, NIC/VRF joins, observer identity, bounded command output, endpoint corroboration, listing-derived container capture and owned delete-only cleanup. Callback completion alone cannot qualify capture or cleanup. A full 200-line container-log tail remains incomplete. The frozen v8 adapter and historical collectors remain unchanged.

Fresh independent reads confirmed all 21 initial absences and the pinned observer image. Corporate funding and CE IAM, quotas, organization policy, image, NIC and zone checks passed. Observer-inclusive quotas and serial, logging and firewall permissions passed separately. A fresh BYOL review plan was retained without submitting consent or infrastructure. These time-bound reads must be refreshed and rebound at execution readiness.

The v9 helpers are not an end-to-end campaign executor. Original-VM guest provisioning, continuously attributed bootstrap capture, shared-runner cleanup integration, interruption recovery and live proof that the observer has no service account remain required before the first apply. No campaign allowance was consumed. Broader lifecycle, networking, traffic, review, release and installed-publication gates remain incomplete.

## Guarded execution qualification

The private diagnostic execution library connects reviewed create submission,
lazy original guest establishment, observations and independently recovered owned
cleanup. Final cloud and serial capture also runs when submission or guest access
fails. Original insert identities and stable independent state/live joins remain
required; missing identities and same-name replacements cannot be adopted.
Cleanup does not require registration or health. Unresolved readers, executors or
guest sessions retain their locks and block deletion.

Twenty-three synthetic orchestration tests cover ordering, startup failure, partial
apply, missing original identities, replacement, state drift, altered reviews,
interrupted observation and separate final capture. These tests provide local
evidence. Production mapping admission still refuses; no campaign CLI is enabled.
All three fresh campaign allowances remain unused.

No-submission reconciliation and the final no-change receipt join remain open.
The journal timestamp mapping still lacks verified Site CLI output and original
bootstrap coverage. Full live lifecycle, networking, traffic, review, publication
and installed artifact acceptance remain incomplete. Historical receipts, frozen
collectors and immutable release assets are preserved.

## Shared no-change state reader

The shared Terraform service now offers optional, explicitly typed inspection of
current nonsensitive state after an exact planned no-change receipt. It preserves
the planned checkpoint and submits no actions. Existing applied and interrupted
inspection still refuse planned checkpoints. Older installed runners do not gain
this capability implicitly. Two failing-first regressions and the 53-test
Terraform suite pass, including state drift, sensitive selections and stale
receipts. The final campaign consumer and original/current ownership join remain
unqualified; this upstream reader does not enable live campaign admission.

## Current receipt and ownership qualification

The private diagnostic bridge now has a separate read-only no-change state type.
It binds the later planned receipt to a preserved original create anchor, checks
unchanged resource identities and brackets the read with stable checkpoint/state
evidence. A versioned current ownership join preserves the historical ownership
receipt and refuses replacement, missing resources, stale bindings and rollback.
Unsubmitted startup reconciliation is qualified locally and makes no cleanup claim.

Later planning retains returned receipts before semantic acceptance. Interrupted
planning retains an unresolved recovery requirement and refuses an unchanged retry.
Actionable drift and interrupted current receipt recovery still require qualified
state readers. The complete campaign consumer remains disabled. Local helper tests
provide synthetic evidence; source CI excludes these private helpers. All three
campaign allowances remain unused. Live journal mapping, broader lifecycle and
networking, traffic, review, release and installed artifact gates remain open.

## Shared planned-state and receipt inspection

The shared Terraform runner now supports explicitly typed current-state inspection
behind a resource-only planned receipt. It returns observed state identities,
including original identities during replacement planning, and keeps the planned
checkpoint. A separate current receipt reader reuses the plan parser to verify
the stored receipt against its exact saved binary. It rejects consumed, partial,
malformed, altered or moving receipts and binary plans, and exports no private
state or bootstrap fields. Existing applied and no-change readers retain their
original checkpoint rules. These optional source capabilities submit nothing.

Private campaign recovery consumers remain disabled pending their qualification.
An incoherent interrupted plan remains unresolved; this reader does not repair
it or authorize cleanup. Source/snapshot reconciliation, final capture ordering,
live journal mapping, lifecycle/network/traffic, review, publication and installed
artifact acceptance remain open. All three fresh campaign allowances are unused.

## Private current resource evidence

The private bridge now has distinct current resource receipt and planned-state
read modes. They validate a later resource-only plan against the original
configuration, provider lock, backend and 21 resource addresses, then compare
actual state identities with preserved original ownership anchors. Supported
create, update, delete and replacement summaries remain read evidence. Neither
mode plans nor submits infrastructure changes. Current bindings remain separate
from the active historical receipt used by guest capture and cleanup.

Local qualification passes 299 Python tests across 27 selected suites and 129 Bun
tests with 650 assertions and two generic fixture skips. Twelve bundles,
typecheck, Ruff and scoped privacy pass. Tests cover changed original anchors,
stale/extra receipts, identity replacement, state/checkpoint movement, incoherent
receipt recovery and concurrent process locks. Both actual Python-to-Bun request
modes parse and refuse the retained source pin before authentication. Original
preparation hashes are unchanged; no live current-state proof is claimed.

Full campaign and cleanup consumers remain held. Missing original resources or
incoherent saved plans explicitly refuse; no historical ownership is rewritten.
Next qualify current ownership joins and reviewed cleanup using separately bound
current evidence, then final capture ordering and source/snapshot reconciliation.
Live journal mapping, lifecycle/network/traffic, review, publication and installed
artifact gates remain open. All three fresh campaign allowances remain unused.

## Current ownership and final capture ordering

A distinct private schema-v3 ownership join now binds actionable resource plans
to immutable original ownership and separately observed current state. It accepts
supported resource action summaries as read evidence, preserves the legacy
schema-v2 no-change API, and refuses missing or replaced identities. Neither join
rewrites historical receipts or authorizes cleanup.

The private controller records original-bound start and terminal evidence for its
independent final capture window before stopping capture and entering cleanup.
Returned capture results remain private and hash-bound. Failed, interrupted,
repeated, altered or inconsistently attributed capture remains unaccepted.
A separate ordering guard requires terminal evidence and a later independently
resolved stop. Late completion records deadline loss and grants no acceptance.
Both executable inventories include the new helper.

Qualification passes 313 Python tests across 28 selected suites, 129 Bun tests
with 650 assertions and two generic fixture skips, 12 bundles, typecheck, Ruff,
formatting and scoped privacy. These are private helper tests; source CI excludes
them. Unchanged collector integration evidence is reused from the earlier run.
No fresh live registration, health, traffic or cleanup claim is made.

Current cleanup still needs explicit qualification using the final capture guard,
separate current evidence, original ownership and a reviewed delete-only plan.
Full campaign, source/snapshot reconciliation, live journal mapping, broader
lifecycle/network/traffic, review, publication and installed artifact gates remain
open. All three fresh campaign allowances remain unused.

## Current destroy planning boundary

A private planning primitive now verifies an exact frozen Python journal and
retained final-capture result before inspecting current resource state, then
rechecks that proof before creating a destroy plan. It binds the terminal record
to the original create and a later resolved capture stop. It verifies the original
hash chain without changing Python floating-point timestamp representations.
Completed and failed captures remain unaccepted; deadline loss stays explicit.

The planner keeps original create and ownership anchors unchanged, retains later
observations and returned plans separately, and records interrupted planning
before refusing an unchanged retry. Current resource actions remain unsubmitted.
Its separate CLI mode and owned-cleanup consumer are still held for qualification.
Journal snapshots over the existing four-MiB read bound explicitly refuse.

Seven focused tests include the actual Python journal and terminal writer, both
capture outcomes, changed proof bytes, unresolved stops, planning interruption
and rejected returned plans. Local verification passes 313 Python tests across
28 suites, 136 Bun tests with 680 assertions and two generic skips, 14 bundles,
typecheck, Ruff and scoped privacy. Both actual read modes parse with the changed
executable inventory and refuse the retained source pin before authentication.
Original preparation and saved-plan bytes remain unchanged.

These private checks provide no fresh live cleanup or operational acceptance.
Next qualify the distinct current-cleanup protocol and owned-cleanup integration,
including reviewed delete-only submission and non-submitting recovery. The full
campaign, source/snapshot reconciliation, live journal mapping, broader lifecycle,
networking, traffic, review, publication and installed-artifact gates remain open.
All three fresh campaign allowances remain unused.

## Explicit current cleanup protocol

The private bridge now has a distinct schema-v2 current-destroy planning request.
It includes the frozen original final-capture snapshot in the exact input and
executable inventory. Existing read schemas remain separate. The explicit owned
cleanup consumer recomputes current ownership from independent live objects,
current state and original insert identities, then verifies terminal capture
before replacing the active receipt with a reviewed delete-only plan. Original
receipts and ownership remain immutable. Invalid returned plans cannot rebind
the active receipt; actionable resource changes are never submitted.

Consumed current preparation cannot be regenerated by a new coordinator or
routed through legacy cleanup. Read-only journal growth cannot mint another
planning attempt for the same receipt, state and terminal capture boundary.
Failing-first tests demonstrated both retry gaps before repair. A preexisting
cloud-client concurrency regression also exposed reservation after asynchronous
configuration I/O. Verified node names now allow reservation before the first
await, preserving invocation order and refusing concurrent requests.

Verification passes 324 Python tests across 29 suites plus 10 fresh offline
collector integration tests in 540.317 seconds, 140 Bun tests with 699 assertions
and two generic skips, 14 bundles, typecheck, Ruff/format and scoped privacy.
Eleven current-cleanup fixtures cover exact proof, changed ownership, invalid
plans, receipt separation, reviewed single submission and independent 21-object
absence, empty destroy, stable state and two read-only resumes. These are local
fixtures; no live cleanup or operational acceptance is claimed. Actual request
parsing accepts all three modes and refuses the historical source pin before
authentication. Original preparation and saved-plan hashes are unchanged.

The current consumer is an explicit private library path. Interrupted current
cleanup recovery, larger-journal qualification, the full campaign CLI and
source/snapshot reconciliation remain required. The audit identifies 11 plugin
files changed since q23's original implementation; its source pin remains held.
Live journal/runtime namespace mappings, lifecycle, networking/traffic, review,
publication and installed-artifact smoke remain open. All three fresh campaign
allowances are unused; frozen assets and historical partial cleanup are preserved.

## Read-only retained current cleanup recovery

The private bridge now has distinct schema-v2 destroy-receipt and actual-state
read modes. Requests bind either the immutable original create or the exact
recovered destroy receipt. Python retains destroy evidence separately from
historical active receipts and current resource evidence. Strict result checks
refuse wrong schemas, operations, private fields and missing identities.

A separate inspection verifies the original journal and resolved executor,
capture and guest barriers; exact retained proof, preparation and handoff request;
frozen final-capture journal prefix; original/current ownership; reviewed
delete-only receipt; actual state; and independent ownership. Consumed destroy
claims, duplicate anchors, missing or replaced originals, rollback and evidence
drift refuse. Changed executable hashes are reported without requalifying the
review. Inspection never plans, recreates a handoff, adopts receipts, regenerates
review or enables submission.

Fresh local verification passes 344 Python tests across 30 suites, including
10 offline collector integration tests in 585.733 seconds, 145 Bun tests with
757 assertions and two generic skips, 14 bundles, typecheck, Ruff/format and
scoped privacy. Five actual Python-to-Bun modes parse their exact inventories and
refuse the historical source pin before authentication. Original preparation
and saved-plan hashes remain unchanged. These are local fixtures; no live guest,
ownership, cleanup, traffic or operational acceptance is claimed.

Two additional shared Terraform regressions directly qualify destroy receipt
recovery and actual original-state reads behind empty destroy planned values.
They refuse removed operation bindings, sensitive fields, altered binaries,
private receipt metadata, consumed plans and changed actions. The runner suite
passes 52 tests with 343 assertions. Runtime code and artifacts are unchanged.

Recovered submission authorization and executor recovery, source/snapshot and
working-copy reconciliation, bootstrap journal timestamp and original runtime
namespace mappings remain required. Full lifecycle, networking/traffic, review,
publication and installed-artifact gates stay open. All three fresh campaign
allowances remain unused, and the PR remains draft.

## Current installation and documented access contract

The clean `c177be807588b9e730138a8d3f561606afedcd79` baseline has a fresh
attempt 189 supported isolated marketplace installation receipt. All 485 GCloud, Platform
and Terraform files matched; Platform dependency installation, explicit
Terraform installation, status, doctor, enable/disable, upgrade, ordinary
registered runtime state, byte retention and isolated removal passed. Fresh
configured-model inference independently verified the repaired gateway
authentication. Separate ordinary sessions selected the installed skill and
executed native upgrade and explicit Terraform failover tools. Both returned
`gcp_operation_not_qualified` with `mutationAttempted=false`. These are qualified
refusal checks; the requested operations remain unavailable.

A fresh 120-by-40 ordinary interactive session rendered the actual native
upgrade refusal and mutation state without capture truncation. This is bounded
terminal text evidence; full visual acceptance remains separate. Exact-head CI
at the stated baseline passed 20 checks with four skips.

A separate ordinary session executed the installed discovery tool against an
isolated GCloud configuration with independently verified zero active accounts.
It returned `validation_or_read_failed` and `mutationAttempted=false`. No
credential fallback or cloud mutation occurred. The actual generic failure
does not establish a more precise authentication diagnosis. The earlier gateway
failure is preserved; subsequent evidence closes that specific prerequisite.

Fresh official F5 GCP and Site v2 documentation agrees with the pinned XC
15.13.0 schema: the SSH public key belongs in Site admin credentials and permits
access as `admin`. The GCP metadata instructions specify `VmDnsSetting` and
token-only `user-data`. This resolves the metadata-path documentation assumption;
it does not prove original-node SSH access, bootstrap-period journal coverage or
runtime namespace mapping. All three fresh campaign allowances remain unused.

The [deployment context](gcp-deployment-context-20261025.md) includes this access
contract, supported Google network constraints and the five remaining F5 NCC
interface/session/policy/traffic joins. The later native result-framing repair
rejects empty or multiple result arrays and asynchronous non-operation replies
before recording completion. Original checkpoints and cleanup receipts are
preserved. Source tests and installed/live acceptance remain separate gates;
full issue 1559, review, publication and published installation remain incomplete.

## Native synchronous create identity recovery

New network/subnet completion receipts use schema version 2 and retain only the
exact original numeric identity and planned selfLink. Reconciliation and final
ownership capture refuse a replacement resource at the same name. Unknown
versions and malformed identities refuse before cloud observation. Legacy
unversioned completion receipts remain readable without submission or rewrite;
they do not acquire original-create identity evidence retroactively. Instance
operation and disk recovery paths remain intact. Failing-first tests retain the
original replacement failures and wrong-type stored identity failure. The
321-test CE suite and targeted TypeScript checks passed at attempt 184. Attempt
187 subsequently qualified installation of the current payload, including the
later asynchronous target repair. Live acceptance remains open; the preceding
installation and CI results belong to the explicitly stated current baseline.

## Native asynchronous operation target binding

The official Google discovery directory advertised Compute v1 revision
`20261016`. Its Operation schema defines `targetId` as a string uint64 that
identifies a specific incarnation of the target resource, and `targetLink` as
the modified resource URL. VM insert, start, stop and resize return Operation.
Two guessed documentation locations returned 404 and remain failed evidence;
the successful directory and advertised schema are retained separately.

New native VM operation receipts use schema version 2 and retain only the
original target ID and exact scoped selfLink alongside operation evidence.
Mutation submission checks the reviewed VM identity. Creation binds the
insert-operation target, then rejects replacement before boot-disk capture and
final ownership insertion. Async reconciliation retains and checks the original
target; missing or changed fields refuse. Field availability is not assumed
from the schema. Version 1 operation receipts remain readable without rewrite
or retroactive target evidence. No new engine or capability is enabled. Source
regressions and fresh installation still do not qualify live behavior; original
guest mappings, lifecycle/network traffic, recovery, cleanup, review and
publication gates remain open.

## Fresh guest troubleshooting contract review

Attempt 188 retained the official Site v2 troubleshooting guide through its
published link. It confirms VPM status and journal access, but its journal
examples omit year/timezone and use an unbounded follow command. It does not
document runtime namespace selection or `crictl` commands. The original journal
timestamp and runtime namespace holds remain unresolved. No guest access or
infrastructure submission occurred; all three campaign allowances remain unused.

The deployment context now records F5's SSD, sequential IOPS and etcd latency
recommendations. The proposed multi-zone topology still needs measured evidence
against these prerequisites. The documented disk diagnostic writes temporary
benchmark data and requires reviewed diagnostic scope. Documentation does not
qualify guest capture, topology performance, health, routing or traffic.

## Current runtime evidence boundary

Attempt 189 sealed its installation, actual model/tool transcripts, interactive
capture, negative discovery and removal receipts. The initial checker rejected
the intentional typed tool error. One failing-first regression and seven checks
qualified the retained refusal using exact call identity, project, engine,
rendered content and nonmutation evidence, without replaying the prompt.
The earlier broad-exception lint failure is retained; corrected capture helpers
pass style and privacy checks. Raw transcripts, credentials and state remain
private. The checkpoint SHA-256 is
`fe0381f558ab5734cd644847fbc0bb378e4fdefae6f1aa6e7c4de3ac5ff68b69`.

The [reviewed deployment prompt](gcp-reviewed-deployment-prompt.md) binds explicit
scope and researched controls. It does not authorize apply or clear guest
mapping, current-origin admission, lifecycle/network/traffic/recovery, cleanup,
review, merge, publication or published installation gates. All three fresh
campaign allowances remain unused.

## Reference guest command evidence

Attempt 191 verified bounded journal help/version/options and a fresh runtime
listing with one original-bound inspection on the existing KVM reference.
The [reference receipt](gcp-reference-command-contract-20261025.md) records the
observed systemd 252 compact UTC dialect, nine failing-first parser tests and
the existing shared parser's full container/namespace projection. Recent
journals and a listing that already includes namespaces do not clear either
GCP guest mapping hold. No infrastructure or guest configuration changed.
