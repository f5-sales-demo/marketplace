# GCP live compiled Site and Token composition

Issue: #1559. Delivery: draft PR #1698.

Fresh real Site and JWT Token API responses now pass through the compiled
Platform producer and compiled Terraform bootstrap collector. The source tuple
uses Terraform 1.17.1, Google 8.11.0 and xcsh provider 15.15.7; fresh official
release checks confirmed these remained current. The reviewed scope contained
two Platform resources and no CE VM or GCP managed resource.

An independent verifier reviewed both initial API absences, exact provider
executables, original saved create bytes and the two owned creates. One apply
created the resources. Original API UIDs matched the runner's creation hashes;
declared labels, Google's provider marker and the GCP wire form matched. Private
JWT inspection through the issuing Platform module agreed with the original
captured body, while a copied Terraform candidate refused. No sensitive token
`uid` or `content` was selected from state.

The compiled collector's two state reads remained stable. A subsequent original
Terraform plan reported no changes. This completes the reconciliation step
missing from the earlier field campaign. That earlier failed capture and its
original artifacts remain preserved and unaccepted.

The positive composition receipt has SHA-256
`77d0213a83af1d277fa52e217fbd625ddb0abc72717c0995bac253625ddf9824`.
The no-change receipt has SHA-256
`a85d9d7207a3b9562bd7f4ccd3f36fe3ebb3fcc8aa8aa1a8358b3fd5f55a0627`.

Current ownership was independently checked before a separately reviewed,
delete-only saved plan was submitted once. Cleanup did not require a fresh JWT,
registration or health. Independent closure verified two fresh API absences,
empty typed destroy, stable empty state, two resumes without submission and all
34 original executor groups absent. No new unresolved lock remains. The closure
receipt has SHA-256
`19fe75ca946e508fa8758d3e48b14f5cd6b5ee38f134ed8a52a2e7b523166764`.

This establishes live compiled metadata composition and cleanup. Bootstrap
execution remains unqualified until original VM, token, NIC and lifetime joins
and shared durable single-use checkout pass. Google 8.11 managed insertion,
full default installed capture, actual same-provider expiry refresh, all native
and Terraform guest/network/lifecycle acceptance, ordinary installed runtime,
review, publication and published installation remain open.
