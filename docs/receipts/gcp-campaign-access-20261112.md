# GCP campaign access source qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

GCloud 1.7.51 and Terraform 2.4.86 add original campaign-only SSH key preparation
before observer planning. Platform remains 6.3.22. This qualifies source behavior;
normal installed runtime and managed guest acceptance remain open.

## Behavior

The installed `gcp_ce_access_prepare` tool requires explicit GCP Terraform owner,
Platform context and one canonical SSH source IPv4 `/32`. It submits no cloud
resources. The registered Terraform service generates two distinct Ed25519 keys
and returns only the CE Site and observer public blocks. Private key files and
identity manifests remain in owned, canonical, single-link private storage.

Original private/public correspondence is independently derived from the actual
private seed. OpenSSH independently reads both generated keys. Before new
configuration preparation, the installed service binds them to the exact original
intent. Existing keys retain original file and parent identities across restarts;
changed bytes, replaced files, symlinks, hard links, widened permissions, foreign
scope and attempted rebinding refuse. Partial preparation and a missing intent
binding preserve refusal rather than creating replacement credentials. Normal
adapter field order does not change an otherwise identical owner.

CE cloud-init remains token-only. The CE admin public key uses the existing Site
setting; no shell accounts, password fallback or serial login are introduced.
Observer configuration version3 retains all 21 reviewed resources, the fixed
Ubuntu image and numeric ID, and no observer service account. Current HA provider
and default live-capture gates remain unchanged.

The public teardown dispatcher now selects configuration version3 as well as
legacy version2. Full 21-resource and observer-disk-only cleanup regressions use
the actual typed tool dispatcher and finish with 21 absences, empty destroy,
stable state and two non-submitting resumes without private keys or guest access.
These are source tests, not fresh managed cleanup evidence.

## Verification

- Failing-first key preparation, public registration and configuration-v3 cleanup
  dispatch tests retained, including newly reproduced replay and owner-order defects.
- 1,465 shared and canonical tests pass, with 11,798 assertions across 196 files.
- All three native runtime builds and native TSGO typechecks pass.
- Catalog, locks and installed dependency graph checks pass.
- Fresh official version reads match Terraform 1.17.2, Google 8.11.0 and xcsh 15.15.7.
- Official OpenSSH private-key format documentation retained privately with SHA-256
  `8479c767aeb256e4b2465d23f96dd98998d4210f12c0c9b41bd0a6f1f2e6f17c`.

Initial fixture type, tracker-staleness and receipt blank-line failures remain
preserved. The secrets scanner also matched the literal PEM template in source
and bundle; delimiters now use the format label, with unchanged emitted key
format independently read by OpenSSH. Scanner rules remain unchanged. The final
suite followed the normal tracker reconciliation; no scanner or acceptance rule
was weakened. Private evidence retains exact source, executable and log hashes.

## Remaining gates

Genuine default installed capture, in-flight or original-budget post-apply
bootstrap corroboration, serial-derived SSH trust, attributed guest journals and
container evidence, current CE provider/HA qualification, full native/Terraform
single-node and HA networking/lifecycle/content-traffic acceptance, independently
reviewed live cleanup/restoration, ordinary configured-model Ubuntu `bun dev`,
required review and current-head CI, merge, publication, verified download and
published installation all remain required. Historical failures, locks, frozen
executors and immutable v12.3.1 assets remain preserved.
