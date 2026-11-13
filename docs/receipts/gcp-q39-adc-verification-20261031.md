# GCP q39 refreshable credential verification

Issue: #1559. Attempt: 310. Full issue acceptance remains incomplete.

Google documents workstation ADC as separate from CLI authentication. The
[Google 8.7.0 provider reference](https://github.com/hashicorp/terraform-provider-google/blob/v8.7.0/website/docs/guides/provider_reference.html.markdown)
supports ADC and states that Terraform cannot renew explicit access tokens.
The existing owned, private authorized-user ADC file was inspected without
exporting its refresh token or client secret.

Its account field was empty. Strict account admission therefore refused before
command launch. A separate verification-only successor preserves that refusal,
admits no production execution and permits checking an unattributed candidate.
Foreign account metadata still refuses. The supported ADC token command then
completed naturally, and exact ADC identity, metadata and bytes remained
unchanged.

A fresh token was independently checked against Google's token information
endpoint using verified TLS. Its account, client audience, cloud scope and
expiry matched the intended context. The same token successfully read the
exact active GCP project. Both HTTPS reads used original numeric DNS results,
fixed endpoints, bounded complete JSON framing and one shared sixty-second
operation window. Raw tokens and responses remain private.

Seven failing-first guard and principal tests passed. Four original CLI and
resolver process groups were independently verified absent with fresh SDK and
kernel observations. Private E/F lint checks passed. The initial temporary
directory alias refusal is preserved; subsequent Mac checks used
`TMPDIR=/private/tmp`. No credential configuration or infrastructure changed.

This verifies the existing ADC refresh path, server principal and project
access. It does not enable production credential admission or prove refresh
during a long cloud apply. An explicit successor must bind this evidence and
the original ADC file into the exact q39 Platform workspace and environment,
refusing credential overrides and any engine switch. Production final capture,
bridge, guard, installed runtime, live lifecycle, guest, networking, traffic,
recovery, cleanup, review and publication remain open. Historical capture and
reader closure flags remain false. PR #1698 remains draft.
