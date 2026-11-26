# Capture cleanup ownership inspection source qualification

Issue #1559 remains open. This receipt qualifies source components and generated
runtime exports. Real GCP ownership admission, independent reader closure,
reviewed cleanup, supported installation, ordinary Ubuntu bun dev, full feature
acceptance, CI/review and publication remain unfinished.

An interrupted capture can retain the original unresolved executor lock.
The normal ownership reader requires runner access, creating a circular
dependency before cleanup can verify cloud ownership. The shared read-only
inspection path verifies original manifest, configuration, provider lock, state,
create checkpoint, saved plan and failed-lock bindings without runner resume.
It checks original executor and independent reader closure before and after
the two read-only Terraform commands. It preserves failed capture flags and
never admits apply, destruction or writer recovery.

The GCloud state candidate projects only declared resource addresses and IDs.
Its hash and decoded state use one immutable snapshot. It rejects malformed
creation receipts, foreign or ambiguous state identities and changed hashes.
Full, partial and empty candidates remain inspection evidence with no live
ownership, reader closure or execution authority granted by the candidate.

Verification:

- a1690: the failing-first snapshot test observed changed decoded state despite
  verification of the original hash. The snapshot repair passes all 19 cases.
- a1697: three malformed receipt forms failed the required rejection tests.
  Exact schema, boolean and action validation now pass all 22 candidate cases.
- a1704: the missing independent inspection path failed before implementation.
  Tests now cover original failed-lock retention, sensitive projection refusal,
  empty state, missing lifetime binding and replacement during inspection.
- a1712: the normal generated runtime export smoke failed before the source
  export repair and normal three-plugin rebuild.
- a1715: 137 cases and 738 assertions pass across seven affected source and
  generated-runtime files, including existing Terraform state projections,
  HA/observer ownership and 21-resource or observer-disk-only cleanup recovery.
- a1716/a1717: current strict Terraform and GCloud typechecks pass.

Ubuntu Google authentication renewed and independently verified expected
project access in a1684. MacBook Google verification still requires interactive
sign-in. Authentication does not establish real original-provider token refresh
across expiry or any deployment behavior.

The next gate connects this source-qualified reader to the current signal-free
executor, original reader-group evidence and independent GCP/XC ownership joins.
The complete factory remains inactive. The retained fresh 21-resource campaign
has not submitted apply. Historical evidence, locks and immutable v12.3.1 assets
remain preserved.
