# GCP original provider refresh and local cleanup

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Draft PR:
<https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempts 322 and 323 verify real token refresh across expiry through one original Google 8.7.0
provider process using Terraform 1.16.6. A reviewed local fixture created three `terraform_data`
objects and performed three deferred Google client-configuration reads. It created zero GCP
resources. A deferred read kept the original provider alive through the final callback.

Both tokeninfo responses were collected through verified HTTPS and independently checked for
principal, audience, scope and server expiry. The after-token inspection used a distinct token
after the conservative expiry upper bound plus one second. Four original boundary captures
retained the same provider PID, process group, boot and birth, with independent raw kernel and
SDK joins. Original ADC, executable, provider package, configuration and saved-plan bytes stayed
bound. The two-hour operation and fixed five-minute final reserve retained their original start.

The independent reviewer verified raw bodies, original token values, request and acknowledgement
hashes, full bounded trace bytes and original process identities. The shipped shared evidence
verifier accepted their consistency. Four original process groups were independently absent.
The successful claim helper released its root and workspace claims only after original closure
review. The process-scoped awake assertion ended naturally; global power settings were unchanged.

One reviewed delete-only saved plan removed all three owned local objects. Cleanup verified empty
state, an empty destroy plan, a stable state hash and two read-only resumes without submission.
Eight cleanup executions closed independently. Raw tokens, state and captures remain private.

The prior local attempt failed because a generic capture-directory reader rejected the standard
SDK directory while its credential file was private. Its failure and cleanup remain preserved.
The successor uses the already qualified ADC file guard: exact path, owner, private single-link
file, stable identity and bytes, bounded authorized-user content, token URI and client audience.
No credential or directory permissions changed. A separate trace reader repair retains complete
captures within the existing four-MiB guard limit; oversized captures remain incomplete.

This qualifies original-provider refresh and local cleanup. It does not qualify GCP guest,
registration, health, routing or traffic behavior. Production credential admission, workspace
and shared-runner integration, final capture and full native/Terraform lifecycle acceptance
remain open. The PR stays draft; publication and published installed acceptance remain open.
