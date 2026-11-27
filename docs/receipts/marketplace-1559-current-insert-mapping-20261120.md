# GCP insertion mapping source qualification

The current Terraform 1.17.2 / Google 8.12.0 / XC 15.17.6 profile needs the same
Compute insertion mapping as Google 8.11.0. The official Compute instance source
is byte-identical at the two immutable provider commits:

- Google 8.11.0:
  [67f96115b523ba050b11dad30237f14023667de8](https://github.com/hashicorp/terraform-provider-google/blob/67f96115b523ba050b11dad30237f14023667de8/google/services/compute/resource_compute_instance.go).
- Google 8.12.0:
  [5d2ae61997230ec12262ca575657308dbcbfa70b](https://github.com/hashicorp/terraform-provider-google/blob/5d2ae61997230ec12262ca575657308dbcbfa70b/google/services/compute/resource_compute_instance.go).

Both files contain 167,091 bytes and have SHA-256
`2a9c4ad8b6107834b7977251da3415dfdc558eee6d308fd8949a1760bdef1b55`.

The CE insertion validator accepts the exact current artifact profile and
requires the verified provider window for Google 8.12.0. The observer validator
derives its expected configuration from that profile's XC provider version.
Original plan, callback, response, image, resource identity and body provenance
remain required. Serialized copies and mixed artifact profiles are refused.

The initial current-pair regressions fail against the earlier validators and
pass after the repair. Current and retained insertion tests pass 55 cases with
216 assertions; the Terraform typecheck also passes. These tests use original
plan, output, callback and observation issuers with explicit synthetic HTTP
observations. The full Terraform suite passes 841 cases with 4,470 assertions. Shipped parser
and inspector tests pass, including refusal of copied bodies and mixed profiles.
The original inspector is exported for insertion-witness consumers.

This receipt covers source mapping. Live VM creation, guest SSH trust,
bootstrap/VPM/container capture, routing, traffic, recovery and owned teardown
remain acceptance gates for [issue #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Default creation admission remains held. Immutable v12.3.1 assets are preserved.
