# CE UAT75 multi-platform AWS provider lock

Installed UAT74 failed real Terraform validation on macOS because the immutable AWS provider lock contained only a Linux extracted-package hash. Terraform could download the signed archive, but cached-package validation rejected the extracted macOS package. The failed candidate and diagnostic remain retained.

Terraform 1.16.5 independently retrieved signed HashiCorp AWS 6.63.0 packages for `linux_amd64`, `linux_arm64`, `darwin_amd64` and `darwin_arm64` with `terraform providers lock`. The resulting immutable lock includes four extracted-package hashes and the existing signed archive hashes. The compiler digest and bundled runtime asset bind those exact bytes.

The regression checks extracted-package coverage, fixed provider version and compiler lock integrity. All four plugins advance to UAT75. Package-signature qualification does not establish execution on every OS/CPU pair; installed runtime receipts record the platforms actually exercised.

The public terminal teardown qualification uses real Terraform and owning services with synthetic cloud/F5 responses and a synthetic upstream terminal checkpoint bound to a real final plan. Live absence, other-stage retirement contracts, the full CE matrix, failed 45-second recovery, vendor interface control/freshness, producer qualification and explicit UAT acceptance remain separate open gates.
