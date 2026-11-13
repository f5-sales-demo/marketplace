# GCP public Terraform provider prerequisite qualification

Immutable XC [v15.13.0](https://github.com/f5-sales-demo/terraform-provider-xcsh/releases/tag/v15.13.0)
passed verification of all thirteen asset digests, signed checksums and source ancestry.
The release commit is `7dac14864bf55c5200a347a7d13b980937c2d7f3`.
Terraform 1.16.6 generated a verified lock for Google 8.7.0 and XC 15.13.0 on
Darwin ARM64 and Linux AMD64. Its raw SHA-256 is
`6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a`.
The installed provider schema exposes computed, nonsensitive creation identity hashes.

A disposable installed XC-only campaign matched both original POST identity hashes
to independent live UID hashes and Platform observations. Its follow-up plan contained
only no-op changes. Exact reviewed teardown passed, both objects were independently
absent, and the final destroy plan was empty. No GCP resources or software orders
were created in this campaign. Binary plans, state and credentials remain restricted.

The executable marketplace source was `3a954d1be7206fe6fa870c88c99c43a812243377`.
The frozen Platform bundle SHA-256 was `41da08c1f49749d025109ba4e4ba044727611b2841d8240570eecdb47a9e6ab0`;
the frozen Terraform bundle SHA-256 was `c7a7c055e3ee2407c0c69f340b3ec0afe6b7e215ac1efa1c3efb9f68a5b56dfc`.
The private campaign receipt SHA-256 is
`5856b18f9acd73b7fcbaea48ddc959135f0240dc49b74f5d98bc9d6236122974`.

Public artifact packaging passed exact-head CI at
`92a2a0c9e8ac96604d83373d33a2755ab99994f7`. The first public cloud campaign
stopped at prelaunch authentication before review or submission because the Mac
Google CLI session required reauthentication. After refreshing that session, fresh
Montréal deployment, interrupted recovery and partial disk cleanup passed at source
`a92f2c9778a3ff57811e29707196a8412b5cfc65`; see the
[installed acceptance receipt](gcp-public-terraform-deployment-20261019.md). Prior native acceptance
retains its original source and bundle attribution. PR #1566 remains draft.
