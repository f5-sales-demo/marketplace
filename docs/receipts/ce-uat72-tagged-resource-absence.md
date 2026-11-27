# CE UAT72 tagged-resource absence checks

AWS Terraform teardown no longer skips malformed or non-ELB entries returned by the Resource Groups Tagging API. Every mapping must have one exact deployment, manager, engine and source-plan tag, and an ARN matching the deployment partition, region and account. Unsupported resource types remain unknown and block completion.

Supported EC2 ARNs join captured or discovered resource IDs before independent identity-filtered reads. An attachment ARN retains its captured VPC or Connect type. Duplicate ARNs across pages, unsupported pagination fields, malformed identities and ownership substitutions remain unknown. Captured ELB ARNs must match deployment scope before any request.

The regressions reproduced false absence before repair. Nine focused tests and 341 assertions pass after repair. These are synthetic AWS protocol tests; they do not establish live cloud absence, parent-journal retirement or complete public teardown acceptance. Those requirements remain open in the authoritative CE UAT tracker.

All four candidate plugins advance to UAT72. Publication, exact installed consumption, live qualification and explicit UAT acceptance remain separate gates. The existing failed recovery measurement and vendor interface-control dependency remain unresolved.
