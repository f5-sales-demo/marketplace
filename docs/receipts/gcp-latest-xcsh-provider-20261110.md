# GCP latest provider qualification

Issue 1559 remains incomplete. New deployment artifacts select Terraform 1.17.1,
Google 8.10.0 and xcsh 15.15.7, as reported by the official current-version
endpoints on 2026-11-10. Existing 15.15.6 and legacy profiles retain their original
versions, executable hashes and lock bytes; stored deployments do not migrate.

The new Linux and macOS archives passed registry checksum and publisher-signature
verification against the previously verified key. Fresh standard Terraform
initialization, two-platform lock generation, validation and schema reads passed.
The installed Linux binary matches the authenticated archive and reports an
unmodified source revision. Provider, Secure Mesh site and token schemas match
the preceding patch. This establishes artifact and schema correspondence, not
live CE or installed-tool acceptance.

| Verified input | SHA-256 |
| --- | --- |
| New provider lock | `fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0` |
| Linux xcsh provider | `d30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7` |
| macOS xcsh provider | `c4ec2ffd4896bb25c2b77fe268ad7b14c35e976b47cdc373e2c46d4023aec6f3` |
| Fresh source-read receipt | `240294d3e42f6e1aa1987e40d90993d2c201c662ac8972769bf97aba91cf7847` |
| Independent cleanup receipt | `1ef8dce2aaf32865450b5e47fb0091bac1e9368a92b9e535546980227efac6ea` |

Failing-first tests observed the old default and missing new profile. The shared
suite passes 1,105 tests and 5,056 assertions; the root and canonical suite passes
164 tests and 5,471 assertions. All three native TypeScript checks, runtime builds,
dependency and manifest checks pass. The tracker preserves 22 plugins, 315
surfaces, 2,678 tasks and historical receipts. A separate check with the older
JavaScript TypeScript compiler failed in installed xcsh dependency types; that
compiler discrepancy is retained for investigation, without edits to dependency
files or suppressed diagnostics.

Ubuntu's user Terraform command now resolves to the verified 1.17.1 binary in a
versioned user directory. The previous command link and toolchain binary remain
preserved; installation required no elevation or signing.

After independently rechecking the previous campaign's cleanup, a fresh standard
runner and default compiled-reader fixture used the new tuple with Bun 1.4.4.
It retained 9,709 records, two providers and six RPCs. The same original Google
provider and FIFO persisted across two capture windows. Private evidence and
HTTP body checks, no-change planning, typed local teardown, empty destroy and two
non-submitting resumes passed. Independent inspection confirmed 28 process groups
absent and stable empty state. No managed cloud resource was created or changed.

The 55-second fixture does not establish token refresh across expiry. A scoped
historical audit query returned no entries and provides no positive insert
mapping. Audit attribution, Platform bootstrap ownership, original source
lifetime, observer mappings and the full default installed capture factory remain
required. Full native and Terraform CE guest, network, lifecycle, recovery,
traffic, restoration, ordinary installed Ubuntu runtime, review, merge,
publication and published installation gates remain open.
