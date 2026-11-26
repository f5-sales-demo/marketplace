# Current GCP artifacts and Site SSH schema

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery remains draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The exact Terraform 1.17.2, Google 8.12.0 and XC 15.17.6 tuple was previously
unrecognized by the packaged artifact and Site SSH resolvers. Current source now
contains separately attributed configuration-v2/v3 artifact profiles, installed
executable identities and the published Site admin-key/SLI service schema.
These permit preparation and exact original-input resolution for qualification.

Fresh official catalogs confirmed the tuple. Normal registry artifacts, Linux
AMD64/Darwin ARM64 lock bytes and the independently captured provider schema were
verified. The Site admin-key and SLI local-service projection matches the
historical field shape. Current Site schema SHA256 is
`8885cd5d40cb9edde0a822915da15e7a1ed6290d2af81c3d7f6773200d0de799`;
lock SHA256 is
`f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5`.

Five failing-first cases reproduced four absent mappings, then passed with 34
assertions. Tests reject modified locks, mixed versions, unknown releases and
configuration versions. Both configuration graphs preserve immutable inputs.
Current access fingerprints have separate provider attribution; token-only
bootstrap and SLI-only SSH behavior retain their original field mappings.

Validation passes 64 focused cases, all 545 GCloud, 825 Terraform and 303 Platform
cases, all three applicable typechecks and a separate compiled Bun mapping smoke.
The first full Terraform run lacked its Python fixture prerequisites and failed;
its logs remain retained. The corrected existing isolated environment uses
Python 3.15.0, psutil 7.2.2 and pytest 8.4.2. Its 22 focused process, SSH and clock
cases passed before the successful full run. No check or historical failure was
removed. CI and installed current-candidate qualification remain required.

Public creation selection and admission retain their live qualification hold.
Exact historical packaged locks remain resolvable for original recovery and
cleanup. Immutable v12.3.1 is preserved. No cloud campaign was submitted by these
checks. Positive original GCP guest access, attributed complete capture,
V2/callback/default factory, both-engine lifecycle/network/traffic/recovery/
restoration/teardown and qualified publication/installation remain open.
