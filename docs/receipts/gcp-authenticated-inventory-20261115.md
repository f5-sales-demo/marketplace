# Authenticated original cloud inventory

Issue #1559 remains incomplete. Terraform 2.4.102 adds authenticated inventory
reads for disks, networks, subnetworks and firewalls. The full built-in capture
factory still needs to compose these reads with original insertion and guest
capture before live qualification.

Google's current Compute v1 discovery document confirms the four GET paths and
uint64 string resource identities. The original ADC project supplies the scope;
resource arguments cannot override project, method, endpoint or query. Global,
regional and zonal targets use exact shapes. The target is copied before validation
so a changing getter cannot produce a different request. Regional reads remain
bound to the owning region.

Raw replies are privately flushed before interpretation. Present resources must
match kind, exact name and self-link, regional or zonal identity, uint64 ID and
valid creation timestamp. Original identity and ownership/topology fields remain
bound across reads, with canonical label order. An attributed Google notFound
body supplies an absence candidate. Inventory supplies no creation ownership or
bootstrap authorization. Resource evidence has a separate source-issued reader;
copies, foreign readers, input changes and same-byte file replacement refuse.

Interruption tests exposed a shared transport defect: a cancelled request could
wait for a later stream closure and record incomplete bytes as complete. Resource
cancellation now reaches the authenticated reader, cancels pending body reads,
checks the deadline after each read and retains stream cancellation failures with
the transport error. Retained chunks are copied. Existing byte and command bounds,
no-redirect behavior and original credential checks remain in force.

CI also exposed the bootstrap stage using its 15-second startup callback throughout
background collection. The original controller now issues a distinct operation
lifetime verifier for its before callback. Startup release still uses the unchanged
15-second check; background work checks the original two-hour budget and identity.
Lifetime verification refuses at operation expiry, final capture or closure and
cannot be obtained from copied or after callbacks. The HA fixture advances beyond
the startup deadline before target collection, proving the corrected separation
without widening or renewing a deadline.

Source and compiled tests use explicit offline transports and actual issuing
modules. No live cloud campaign or grant was submitted. Full inventory projection,
original cloud insertion/serial/guest capture, independent closure/cleanup,
all requested native/Terraform networking and lifecycle acceptance, remaining
installed checks, review/CI/merge/publication and supported user installation
remain required.

Validation passed 534 shared Terraform tests across 54 files and ten compiled
bridge/runtime checks. Strict Terraform typecheck, three runtime builds, catalog
consistency and supported presentation tracker update passed. The failed earlier
CI run and its raw log remain retained; the changed source requires fresh CI.
Historical runner tests containing process-signal cases remain a required CI gate.
