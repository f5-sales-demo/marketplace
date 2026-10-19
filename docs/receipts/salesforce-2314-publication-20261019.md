# Salesforce 2.3.14 publication verification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1624>.
Delivery: <https://github.com/f5-sales-demo/marketplace/pull/1637>.
Source: `5e01e73f9680cdf8885951b641e20ebad023a0c3`.
Plugin: 2.3.14. Minimum runtime and source-test SDK: 23.8.0.

PR 1637 merged with green CI. Source verification passed 336 Salesforce tests
with 2313 assertions, full hermeticity, compatibility, manifests and catalog
checks. Tracker and renderer ownership verification passed 12 tests with 523
assertions, covering 23 plugins, 324 active surfaces and 2757 tasks. The source
receipt preserves commands and candidate behavior:
<https://github.com/f5-sales-demo/marketplace/blob/main/docs/receipts/salesforce-default-information-20261019.md>.

Immutable release 417531056 uses tag `salesforce/v2.3.14` at the source above.
Publication workflow 39290227480 succeeded. Downloaded archive SHA256:
`ba5425193e23791a394ef1e0cac34ae9252e66a8e7ef7ebcd8ade8258a980718`.
All 102 shipped files matched the installed caches after the normal qualified
plugin upgrade on both MacBook and Ubuntu. No service probe ran on Ubuntu.
The MacBook runtime remains 23.9.1; Ubuntu remains 23.8.0.

These observations establish source, merged delivery and immutable plugin
publication. Final compatible runtime publication, installed rendering and
restricted MacBook service acceptance remain separate. Runtime expansion cue
work is tracked in <https://github.com/f5-sales-demo/xcsh/pull/5032>.
Historical receipts remain preserved. Desktop font raster fidelity and model
selection remain separate evidence requirements.
