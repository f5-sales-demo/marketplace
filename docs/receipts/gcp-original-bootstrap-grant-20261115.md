# Original bootstrap grant publication

Issue #1559 remains incomplete. This receipt records source and offline execution
checks for Terraform 2.4.99. It does not qualify a new live deployment.

The signer accepts only an original consumed prepared scope, an original token
reader receipt and original Platform-issued Site/Token evidence from the same
capture context. It checks plan and scope bytes, reader request, token creation
identity, provider process, ownership, JWT content and expiry before release.
The Ed25519 key remains inside its source lease. The payload uses the provider's
exact domain and field mapping, unpadded standard Base64 and the raw JWT hash.

An exclusive immutable claim and a shared storage claim are flushed before
one-use bootstrap checkout. Failed persistence, checkout, interrupted publication
or an uncertain rename leaves the attempt claimed. Concurrent callers have one
winner. Neither re-entry nor a resumed store authorizes a new checkout.
Publication uses the shipped Python publisher with Linux atomic no-replacement
rename, pinned source/executable inputs, a 60-second command limit, a 15-second
startup limit and the original two-hour budget. Grant freshness remains bounded
at five minutes. Both writer and provider enforce a 16 KiB envelope limit.

The success fixture holds original HA capture open while issuing the Site and
Token receipts; two other tokens remain pending. It uses the actual Platform
body issuer and shared checkout, runs the real Linux publisher, checks the
signature against the original public key and verifies the retained claim.
Failure fixtures cover copied references, unconsumed scopes, directory changes,
claim-flush failure, checkout failure and uncertainty after rename. The compiled
entrypoint rejects serialized authority before checkout or execution. These
fixtures use explicit offline seams and establish no installed or live claim.

Official version endpoints checked on November 15 report Terraform 1.17.2,
Google provider 8.11.0, XC provider 15.17.3, Bun 1.4.4 and xcsh 23.10.13 as current.
The declared TypeBox, Bun types and qmd development dependencies also match their
current published releases. No older compatibility requirement justified holding
back a new dependency version in this check. Historical collectors, receipts,
locks and immutable v12.3.1 artifacts remain retained.

Builtin capture/controller composition, actual provider grant consumption,
independent closure and cleanup, remaining installation/authentication checks,
all native/Terraform networking and lifecycle acceptance, recovery timing,
content-verified traffic, review, CI, merge and publication remain separate gates.

Validation passed 509 shared Terraform regressions across 54 files, including
the Linux Python publisher/observer wrapper, and seven compiled bridge/runtime
checks. The historical runner test file containing process-signal cases remains
a CI gate. Terraform strict typecheck, three runtime builds, Biome, Ruff, catalog
consistency and the supported presentation tracker update passed.
