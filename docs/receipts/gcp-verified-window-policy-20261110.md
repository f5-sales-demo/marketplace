# GCP completed-observation window policy

Issue 1559 remains incomplete. The latest provider reader now uses explicit
version4 windows with a completed-before-window-end policy. An observation is
committed only after its source and witness checks finish before the unchanged
45-second boundary. Late attempts remain separate, unqualified private evidence;
their proposed observations do not enter the completed window. Final verification
stays within the fixed 60-second command budget and original operation deadline.
Empty windows, source changes and budget exhaustion refuse. Historical version3
requests and their stricter late-verification refusal remain unchanged.

Failing-first tests cover the new profile, timestamp boundary, empty windows and
latest-reader dispatch. Tests retain the original 45-second interval and 60-second
budget. The latest reader rejects wrong policies, late observation timestamps,
invalid boundary counts and empty evidence. Python refactoring satisfies existing
Mypy and Pylint limits; no lint configuration or suppression was introduced.

All 68 related Python tests, 1,121 shared tests and 164 root/canonical tests pass,
with Ruff, Mypy, configured Pylint and all native typechecks/builds. Earlier
source-pin preflight failures were resolved by the supported source build.

A fresh source-read run was submitted only after independent previous cleanup.
It failed when Linux denied inspection of the prospective provider's stderr
descriptor. No elevation or permission bypass was attempted. This capture remains
unaccepted; its private stderr and failed locks are preserved. Typed local cleanup,
empty destroy, stable empty state, two non-submitting resumes and 22 independently
absent process groups passed. No managed cloud resource changed.

| Private evidence | SHA-256 |
| --- | --- |
| Original failed capture | `0bbd8f5302f35ed67d80dafaee475e41192b91ff2a76761a836f5bcdd7c23531` |
| Typed recovery | `73b73b02276323513146a1db0a622be9677e9d7c195787e81b3f9d6a94c49422` |
| Non-submitting resumes | `1a79252537ff28c916d889ee7546a4c76696135dc5ae469d70081a5bcd4ec1df` |
| Independent cleanup | `5aa6bd37a4c9e6e44e0f6040638a81f5dc357c34ef875052fb6604a546cba0dd` |

Live window/correspondence qualification remains unmet. Resolve prospective
provider lifetime and descriptor access through the supported original source,
then complete bootstrap ownership, source lifetime and full default capture.
Real credential expiry and every full native/Terraform guest, networking,
lifecycle, traffic, restoration, ordinary installed Ubuntu runtime, review,
publication and published installation gate remain required.
