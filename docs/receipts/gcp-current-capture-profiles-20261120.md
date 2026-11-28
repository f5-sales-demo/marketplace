# Current GCP capture profile mapping

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Draft delivery: <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The artifact registry recognized Terraform 1.17.2, Google 8.12.0 and XC 15.17.6,
but capture preparation retained older pins. The TypeScript XC reader used
15.17.3 while Python admitted only 15.16.2. Current Google stderr capture was
also classified under the older window schema. These gaps prevented using the
current tuple to prepare an original capture.

Readers now select exact original executable pairs. Provider attribution comes
from the original prepared scope and fresh body issuer. Current pre-apply
evidence uses schema 5, and post-apply evidence uses schema 3. Historical schemas
and locks retain their original identities. Mixed, unknown or copied inputs
remain refused. The current API and types are exported in the runtime bundle.
Public artifact selection and live creation admission retain their hold.

Failing-first cases reproduced missing profiles, wrong window classification,
missing post-apply API and the missing packaged export. Validation passes 103
focused cases / 643 assertions, all 547 GCloud, 833 Terraform and 303 Platform
cases, three typechecks, Python Ruff/Mypy/Pylint, a separate compiled mapping
smoke and isolated runtime packaging tests. Existing failure logs are retained,
including the omitted checksum alias and paired fixture-clock correction.

Six published creation/bootstrap/identity source files are unchanged between
XC 15.17.3 and 15.17.6. The actual current published binary was exercised through
Terraform against a synthetic loopback API: unsafe scope refused before any
request; valid scope captured one original POST and retained its creation
identity in state after a failed follow-up. This is native component evidence,
not GCP, guest, bootstrap-v2 or installed-tool acceptance. No cloud resources or
new GCP campaign were submitted. Private raw records remain outside the repo.

Positive original GCP observer/CE SSH, complete attributed VPM/bootstrap/container
capture, V2/callback/default factory, all native/Terraform networking/lifecycle,
content traffic/recovery/restoration/independent teardown and qualified final
publication/installation remain open. Immutable v12.3.1 is unchanged.
