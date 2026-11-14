# CE UAT84 site readback projection

Exact installed UAT83 reached pending-site reconciliation but failed on operating_system_version. The retained site GET includes four status/version fields outside the provider resource schema and expanded reservation defaults. The fixture and original failures remain preserved; no cloud deletion occurred.

A readback-only SMSv2 projection removes those four status/version fields and only the exact unrequested server defaults for empty node lists, segment VRFs, zero tunnel timeout, default tunnel type and default software settings. Direct request rendering stays strict. Nondefault and unknown inputs still enter full comparison or reject; this is not subset matching.

The public pinned provider declares software_settings create-only and write-only, preserving configured input on refresh. This repair qualifies only its unrequested server default. Explicit initial-version readback qualification remains separate.

The new regression failed before implementation and now passes with malformed/nondefault rejection cases. The retained real GET and exact installed provider schema project to the original saved request under canonical comparison. This is source evidence, not live reconciliation.

Full verification passes 2045 tests and 12488 assertions. Four compilers/builds, tracker 478 assertions per action, eight asset/mapping/readiness tests and manifest checks pass. All four plugins advance together to UAT84.

Full UAT, interface control/freshness and transition, the failed 45000 ms restoration criterion, producer qualification/publication, fleet convergence and explicit acceptance remain open. PR1565 stays draft with auto-merge disabled.
