# GCP original group closure source qualification

Issue #1559 and draft PR #1698 remain incomplete. This receipt qualifies
source and offline native closure composition; it establishes no live GCP
bootstrap, guest, networking, traffic or lifecycle acceptance.

The coordinator, inventory and bootstrap stages now accept the same original
output reader's later acknowledged group completion for closure. They retain
the initial final-capture snapshot unchanged, including its false group flag.
Copied callbacks, unacknowledged completion and failed durable acknowledgement
cannot authorize closure. A closure-only proof cannot renew capture time.

Acknowledgement obtains exact completed-output file bindings from the original
writer/reader descriptors while capture authorization is valid. Later closure
checks verify independent full-hash input leases and original source identity.
The final close boundary repeats those checks. Output replacement and byte
restoration remain refused, without overwriting the earlier capture evidence.

Ordinary input monitors still require nonempty files. The completed-output
source explicitly selects any genuinely empty stream by its exact original
zero size, empty SHA-256 and admitted file/parent identity. Descriptor, owner,
mode, inode, timestamp, hash and permanent mutation checks remain enforced.

Verification retained privately:

- Attempt 1164 reproduced the stale coordinator snapshot failure with a real
  gated original output/controller and a companion stage.
- Attempts 1165, 1169 and 1171 reproduced absent proof, empty-output admission
  and restored-output final-close failures before their source repairs.
- Attempt 1175 passes 62 cases and 508 assertions across ten source/stage files.
- Attempt 1177 passes 65 executor, cleanup, invocation and input cases with
  347 assertions across six files.
- Strict Terraform types, canonical source checks, the normal three-runtime
  build and generated catalog checks pass.

The clock fixture verifies that acknowledgement after reserve expiry refuses.
A previously acknowledged physical completion can be inspected after capture
expiry while the overall expired final capture still fails. The operation and
five-minute final reserve remain unchanged. Independent reader/guest child
closure and typed cloud cleanup remain separate requirements.

The next gate is the complete concrete inventory, bootstrap, provider, VM,
observer, CE and guest factory, followed by supported installation, ordinary
Ubuntu `bun dev`, fresh reviewed GCP campaigns and their independent cleanup.
