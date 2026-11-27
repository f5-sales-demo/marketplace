# GCP durable pre-apply checkout

Issue: #1559. Full acceptance remains incomplete.

The shared Platform deployment store now flushes checkpoint bytes before atomic
rename and flushes the directory before reporting success. Owner manifests and storage placement through the root and parent are
also flushed before granting storage access. Existing record formats and engine
ownership checks remain unchanged. A failed final flush is reported as uncertain
persistence; the renamed checkpoint remains available for reconciliation.

Terraform now connects the original pre-apply bootstrap evidence to shared
single-use storage. A private process lock protects a versioned source journal
binding the owner, plan, original creation result, Site/Token identities and JWT
hash. The journal records the claim before issuance. Shared checkout removes the
stored JWT and persists consumption before returning private token-only user-data.
The source journal contains no JWT. Earlier bootstrap receipts are not migrated.

Concurrent checkout allows one success. A new storage instance refuses replay.
Copied source evidence cannot obtain checkout. If the final source checkpoint
fails after consumption, no material is returned; the token stays consumed and
the uncertain claim refuses another attempt. Durability tests verify file flush,
rename, directory flush and failure behavior on real private files.

These are source and explicitly simulated bootstrap regressions. They establish
no original GCP VM, guest, registration, networking or traffic acceptance. The
default installed capture factory remains held pending original VM/NIC/insert/
audit joins, complete source lifetime and refresh evidence, and guest capture.
All original native/Terraform lifecycle, cleanup/restoration, ordinary Ubuntu
`bun dev`, review/CI, publication and installed acceptance gates remain required.

Historical failures, locks, collectors and immutable releases remain preserved.
