# Installed GCP runtime and hermetic factory qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.
Source: `25ca151912291f9ac4a2fb66cbe442c9d7da4f9b`. This receipt records bounded acceptance and keeps full issue
acceptance, review, publication and published installation open.

## Source repair and verification

The factory tests previously required an ambient user installation of the
Terraform SSH clients. A clean CI environment reproduced eight failures.
Each preflight fixture now installs the shipped pinned clients into a private
temporary directory, restores the original environment and removes its fixture
in `finally`. Both installer streams are drained while awaiting natural exit.
Production installation and admission checks remain enforced.

Failing-first attempt a3320 retained six passing and eight failing cases.
The repair passed all 14 factory cases in a3321. The combined factory, installed
client and observer payload scope passed 19 cases in a3323. Terraform typechecking
passed after its declared frozen dependencies were installed. The missing frozen
validation runtime was also installed before tracker checks resumed.

Terraform 2.4.196 follows the supported patch bump. The generated catalog,
source-matched runtime build and 22 runtime, additivity and tracker cases passed.
Independent structured comparison preserved all 2,686 historical task rows and
their evidence, receipts and delivery fields. No verified row was reopened.
Configured lint, privacy, secrets and normal commit hooks passed.

```sh
bun test plugins/terraform/test/installed-capture-factory.test.ts
bun test plugins/terraform/test/installed-capture-factory.test.ts \
  plugins/terraform/test/installed-ssh-clients.test.ts \
  plugins/terraform/test/gcp-observer-client-payload.test.ts
bun scripts/build-gcp-ce-runtime.ts
bun scripts/generate-marketplace-catalog.mjs --check
pre-commit run
```

The original broader runner remains independently retained. Its failed factory
cases belong to the earlier source. Full current-head CI and broader suite
qualification remain required; focused source results do not replace them.

## Supported installation and ordinary runtime

Attempts a3276 through a3317 used supported marketplace commands and distinct
isolated user scopes. GCloud 1.7.97 automatically installed Platform 6.3.41;
Terraform 2.4.195 remained optional and was then explicitly installed. Status
and doctor passed. Authentic snapshots upgraded GCloud 1.7.73 to 1.7.97,
retained exact installed bytes, verified disable/enable and removed all three
plugins from the disposable upgrade scope. Existing user configuration hashes
remained unchanged. These results retain their original source attribution.

Ordinary Ubuntu `bun dev` used xcsh
`054907889c64c92d2e64496e2031e9e0c8071eac`, its source-matched native build
and Bun 1.4.5. No plugin-directory override or substitute runtime was used.
Durable sessions attributed native project identity, explicit Terraform discovery,
concrete unavailable upgrade/failover refusals and wrong-engine refusal without
cloud reads or mutation. Their normal exits returned code 0, with independently
verified original process and group absences.

Attempts a3325 through a3334 verified a separate credential-free Google fixture:
its active-auth list was empty and both credential databases had zero rows.
An exact skill prompt executed the registered `gcp_project_identity` once.
It returned `gcloud_authentication_required`, `auth_required`, the supported
setup prerequisite and `mutationAttempted: false`. The rendered result and
durable call matched. Normal exit returned code 0 and original processes and
groups were independently absent. No process signals were used.

Full forced setup remains incomplete because the retained person-profile lock
has unresolved ownership. The new Terraform 2.4.196 source requires its own
changed-candidate installed acceptance. Unavailable lifecycle refusals qualify
only the refusal behavior; the requested operations remain unfinished.

## Retention and remaining gates

The independent checkpoint in a3332 verified 4,789 files covering recent source,
native bytes, installed runtime and private evidence. Active captures were
explicitly marked partial. Historical executors, failures, locks and immutable
v12.3.1 assets remain preserved. Private transcripts and credentials are not
publication artifacts.

Fresh original guest capture and same-provider token renewal across expiry,
native and Terraform single-node and three-node networking and lifecycle,
content-verified traffic, recovery timing, interruption recovery, independent
cleanup and networking restoration remain required. Unsupported mappings retain
explicit refusals until qualified. Required review, current-head CI, merge,
qualified publication, verified downloads and published installation smoke
remain open. No new GCP campaign was submitted by this continuation.
