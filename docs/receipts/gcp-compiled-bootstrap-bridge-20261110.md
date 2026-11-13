# GCP compiled bootstrap producer bridge

Issue: #1559. Delivery: draft PR #1698.

The compiled Terraform collector rejected valid references from the compiled
Platform producer because each bundle held its own private reference registry.
The original failed probe and artifact hashes remain preserved. Passing source
tests and CI did not prove this compiled composition.

Platform now provides its original body verifier, bootstrap inspector and private
JWT reader through the registered service. These methods stay in the issuing
module. Terraform imports their types and delegates verification to that trusted
producer. Each Terraform candidate retains the original producer and delegates
subsequent private inspection to it. Source callbacks cannot come from tool
arguments or serialized receipts. Older services without this interface refuse
before state reads and report the Platform prerequisite.

Compiled regressions now accept legitimate Platform-issued references while
rejecting copied candidates, copied bodies, foreign capture sessions and modified
body buffers. They verify that the registered Platform service returns the
issuing module's methods. The original creation-hash, owned-label, Google marker,
GCP wire, stable-state and final JWT freshness checks remain unchanged.

This is source and compiled ABI verification. Fresh real Site/Token composition,
post-create no-change planning, original VM/token/NIC/lifetime joins and durable
single-use checkout still gate bootstrap execution. Google 8.11 managed insertion,
default installed capture, actual expiry refresh, full native/Terraform live
behavior, ordinary installed runtime, review and publication remain open.
Historical failed captures, locks, frozen collectors and v12.3.1 are unchanged.

The independent synthetic compiled probe passes using the changed producer
interface. Its receipt SHA-256 is
`3362906b3167fbd79df4c7c36243980f2def684533220efc493a29a06fbfc094`.
The probe made zero cloud mutations and does not establish installed or live
bootstrap acceptance.
