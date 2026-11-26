# GCP campaign key hermeticity and required host qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Terraform plugin 2.4.87 separates portable key custody tests from the required
OpenSSH host qualification. GCloud remains 1.7.51 and Platform remains 6.3.22.
Production key generation, observer intent and execution gates are unchanged.

## Failure and repair

At source `a863c4c255e1f49a89171b46177821bad650ad06`, the broader CI hermetic
plugin job failed because the new unit test called fixed `/usr/bin/ssh-keygen`,
which was absent in its environment. The preceding shared source suite had passed;
that result did not qualify CI. The failed job and logs remain retained.

The portable unit now denies external subprocesses while checking original key
creation, public output, private file permissions and restart behavior. It
neither skips the key tests nor fabricates an external program response.

Actual format acceptance remains a separate required host check:

```sh
bun plugins/terraform/test/gcp-campaign-openssh.qualification.ts \
  --ssh-keygen /usr/bin/ssh-keygen
```

The check requires an available executable, binds its actual digest, generates
both original keys, asks actual OpenSSH to derive their public keys, compares
those results, rechecks original input bytes and executable, and removes only its
own temporary local files after completion. Missing OpenSSH exits nonzero; it
never selects a substitute. Output contains only qualification counts and the
executable digest, with managed submissions zero and guest acceptance false.

This qualifies key format on the observed host. It does not prove GCP SSH access,
serial trust, guest logs, provider execution or full lifecycle acceptance.

## Verification

- Failing-first external-program denial reproduces the CI dependency defect.
- All 10 key custody tests pass with external subprocesses denied.
- Actual Ubuntu OpenSSH independently verifies both generated keys.
- Missing-executable qualification refuses before creating campaign files.
- All-plugin hermetic validation passes 3,032 tests with zero skips.
- Shared/canonical validation passes 1,465 tests with 11,795 assertions.
- Native runtime builds, Terraform native typecheck and dependency checks pass.

The broader local reproduction also exposed absent dependency folders for ASM
Migration, Azure, GitHub, GitLab and KVM. Their exact frozen-lock project graphs
were installed with lifecycle scripts disabled. No source or locks in those
plugins changed; the same broader check then passed. Initial failure evidence is
preserved. Acceptance criteria, CI workflows and scanner rules remain unchanged.

Fresh exact-head CI for this repair remains required. The PR stays draft; default
capture, original terminal-state/bootstrap joins, current CE HA provider mapping,
all native/Terraform managed networking/lifecycle/traffic/cleanup/restoration,
ordinary configured-model Ubuntu bun dev, required review/merge/publication and
verified published installation remain open. Immutable v12.3.1 and old failure
flags, locks and executors are preserved.
