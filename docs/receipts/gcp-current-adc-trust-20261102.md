# GCP current ADC and invocation trust verification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Draft PR:
<https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 320 rechecks the existing ADC before integrating the original-budget apply controller.
Seven current credential and principal regressions passed. A fresh read-only refresh verified
server principal, audience, scope, expiry and exact project access. The original credential file
remained unchanged. Four original read groups, including the retained failed TLS read, were
independently verified absent. Python lint passed.

The first invocation refused before execution because the old source boundary predated retained
reader and test repairs and the current DNS utility bytes. A new scoped boundary qualified the
current inputs. The next invocation reached the token endpoint but the SDK rejected a self-signed
certificate in the chain. This result did not establish an authentication failure.

The active configuration lacked a custom CA property. The existing managed corporate CA bundle
was present and unchanged. Google documents the custom CA property in its
[proxy configuration guidance](https://cloud.google.com/sdk/docs/proxy-settings), and the installed
SDK maps it to the corresponding environment variable. The successful invocation set
`CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE` only for that process. TLS verification remained enabled;
global SDK settings, credentials and managed trust files were not changed. Both refusals and
their raw evidence remain private and preserved.

This verifies current ADC and SDK trust. It does not verify token refresh through one original
Google provider across real expiry. The apply controller still needs dynamic context production,
exact consumer bindings, final capture and independent local-state cleanup. No cloud resource was
submitted, and production admission remains disabled. Full lifecycle and traffic acceptance,
review, publication and published installed acceptance remain open.
