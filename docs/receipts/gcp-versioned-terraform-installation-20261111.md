# Versioned Terraform executable installation

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
PR: <https://github.com/f5-sales-demo/marketplace/pull/1698> remains draft.

Terraform source 2.4.83 and GCloud 1.7.47 select the signed Terraform 1.17.2
Linux AMD64 executable with Google 8.11.0 and xcsh 15.15.7. The provider lock
remains byte-identical to the previous Terraform 1.17.1 profile. Historical
profiles retain their original versions and lock identities.

Supported setup publishes versioned copies in user scope and preserves the
existing default executable or known owned link. Foreign or corrupt files,
unsafe cache directories and executables missing owner execute permission
refuse. Matching concurrent publication preserves the winner; interrupted
publication retains partial archive and review evidence for recovery.
Linux setup and status verify the cached current executable.

Historical cleanup now resolves its stored executable version. Its original
signal-free executor retains one operation budget, original input monitors,
private evidence and unresolved locks. Natural closure and cancellation tests
verify closure before later runner work. An unresolved attempt refuses a second
actor without creating another execution directory.

Live source execution selected and ran vendor version JSON for Terraform 1.17.2,
1.17.1 and 1.16.6 through the production observer runtime. Independent review
verified selected hashes, original process absence, lock absence and unchanged
default link metadata and target bytes. Supported user installation and its
cached check passed. These commands made zero managed cloud submissions.

The initial cache install refused the shared bin directory. The repair treats
that existing known executable as a read-only provenance source while keeping
strict permissions on publication directories. Failure evidence is preserved.
Tests also exposed nonexecutable cache acceptance and a second actor after an
unresolved legacy lock; both were repaired with retained failing-first evidence.

Full same-provider refresh across expiry on Terraform 1.17.2 remains required.
Default installed guest capture, the reviewed 21-resource observer scope,
native and Terraform live networking and lifecycle acceptance, content-verified
traffic, cleanup and restoration, ordinary installed Ubuntu `bun dev`, review,
CI, merge, publication and published installation remain incomplete.
Immutable v12.3.1 assets and historical evidence are preserved.

Validation passed 1,420 shared tests with 11,498 assertions, 12 Python installer
tests, three runtime builds and typechecks, configured Python lint and type
checks, dependency, catalog, manifest, tracker, Markdown and prose checks.
New-head CI remains a delivery gate.
