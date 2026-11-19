---
name: azure-marketplace-terms
description: >-
  Resolve Azure Marketplace image terms, existing consent, and offer visibility
  using the observed purchase plan. Use for Marketplace agreement errors,
  legal acceptance, or image purchase-plan questions.
---

# Azure Marketplace terms

**Canonical resource URI:** `xcsh://plugin/azure/marketplace-terms`

Use native Azure tools directly for this provider prerequisite. Preserve the
user's region, VM size, certification and site-type constraints. An image chosen
during research is a candidate until its exact plan is approved; a failed older
offer must not prevent discovery of a current image satisfying those constraints.

Inspect `az_account_show` and the installed `az_help` command surface. The
agreement commands may be `az term show/accept` or `az vm image terms
show/accept`. Do not assume an `az marketplace terms` command exists. If
authentication is missing, use the existing `azure-auth` setup flow.

Read the exact image with `az vm image show` in the requested region. Treat the
image SKU and `plan.name` as separate fields, and use `plan.publisher`,
`plan.product` and `plan.name` as the agreement identity. The URN shortcut may
resolve image metadata without the requested region; explicit purchase-plan
arguments avoid that ambiguity. If the user only requires a certified F5 CE,
discover current certified SKUs under the native CE plugin's canonical offer
instead of freezing an unavailable legacy offer. Verify certification from
current F5 guidance before selecting an image.

Read the agreement for the authenticated subscription and observed purchase
plan. For the installed `az term` surface, the command shape is:

```sh
az term show --publisher PUBLISHER --product PRODUCT --plan PLAN --subscription SUBSCRIPTION_ID --output json
```

Replace the schematic arguments with observed values and use structured native
tool arguments. `az vm image terms show` uses `--offer` in place of `--product`.
Preserve the complete result privately. Report the exact image/plan identity,
acceptance status, retrieval time, license, privacy and Marketplace terms URLs.

An explicit `accepted=true` read resolves existing acceptance. When
`accepted=false`, present the returned legal documents and obtain the human's
decision for that exact plan before executing acceptance. Existing authorization
for the same agreement persists across resume. After authorized acceptance, read
back the same agreement and verify `accepted=true`. Approval of infrastructure
does not supply an initial legal decision, and a successful write alone does not
prove its accepted state.

If an agreement read fails, keep acceptance **unknown**. Inspect
`Microsoft.MarketplaceOrdering` registration before proposing registration.
Check supported API versions and persisted consent using the documented
subscription agreement endpoints when that tests a specific hypothesis. List
responses use `properties.offer`, `publisher`, `state` and `signDate`; join the
exact plan through its resource ID and collect every page. Do not count another
offer's consent or infer an accepted boolean from an unfamiliar state.

`BadRequest` with an offer-not-found or restricted-audience message is not
evidence of unaccepted terms. Resolve the image's current Marketplace identity,
offer visibility or audience eligibility; do not send a fabricated agreement or
invent legal URLs/signatures. Each follow-up request should test a changed
hypothesis. If no accessible image satisfies the user's constraints, retain the
provider's exact failure and identify the missing publisher/subscription access.

Return to `azure-ce` for immutable deployment planning after resolving the
Marketplace prerequisite. Terms acceptance creates no VM and does not establish
allocation capacity, CE registration, GPU support or workload placement.

References: [Azure term commands](https://learn.microsoft.com/en-us/cli/azure/term),
[VM image terms](https://learn.microsoft.com/en-us/cli/azure/vm/image/terms), and
[purchase-plan information](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage).
