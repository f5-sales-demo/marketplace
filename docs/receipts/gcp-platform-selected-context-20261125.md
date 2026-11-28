# GCP observations retain their selected tenant

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

The shared Platform observer previously captured its API credential when opened.
Later health, teardown and private Terraform environment reads could keep using
that credential after the selected context refreshed. Platform 6.3.34 reads the
current selected credential for each GET and environment request. It retains the
original HTTPS tenant and checks context before sending requests and after
receiving evidence. A changed tenant, missing credential or malformed context
remains unavailable. Original site, node, token and storage checks stay in place.

## Source verification

Eleven new regression cases failed before the repair. The focused suite passed
18 cases and 122 assertions. The affected Platform, GCloud and shared cleanup
suites passed 822 cases and 4,183 assertions across 132 files. Strict Platform
typechecking, normal runtime builds and configured lint passed. Tests use
synthetic HTTP effects and establish no actual cloud or tenant acceptance.

The latest source and previous supported installation were independently
checkpointed before this repair. Concrete cleanup-session and worker composition,
refreshed Ubuntu Google authentication, real installed reads, fresh campaign
capture, every native and Terraform lifecycle, networking, traffic and recovery
gate, independent teardown/restoration, configured-model runtime, current-source
CI/review, merge, publication and published installation remain unfinished.
