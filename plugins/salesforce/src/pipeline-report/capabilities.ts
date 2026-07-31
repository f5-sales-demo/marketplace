// Which pipeline-report sections this org can actually support.
//
// The report was written against one org's custom schema — `FYB_Total_Price__c`,
// `True_ACV__c`, `Renewal__c`, `Product_Segmentation__c`, a specific territory field. None of
// those are standard Salesforce. Elsewhere the plugin fails a query, catches it, and returns
// nothing; here it would issue several queries that cannot succeed and then present the empty
// result as though the pipeline were empty, which is worse than saying nothing.
//
// So capability is decided from the discovered field catalog before any query is built, and
// what could not be built is reported rather than silently dropped.
//
// Pure and free of I/O, so the rules are testable without an org — the same reason
// sf-exec-guard.ts keeps its allowlist logic separate.

/** Field names discovered for this org, plus anything already resolved from them. */
export interface OrgCapabilities {
  /** Opportunity field API names. Undefined when the org has not been described. */
  opportunityFields?: string[];
  /** OpportunityLineItem field API names. Undefined when not described. */
  lineItemFields?: string[];
  /** Territory field resolved empirically for this org, if it has a usable one. */
  territoryField?: string;
  /** Month the fiscal year opens, 1-12. Defaults to January. */
  fiscalYearStartMonth?: number;
}

export interface PipelinePlan {
  /** Query OpportunityLineItem for SKU-level values. */
  useLineItems: boolean;
  /** The line-item currency field to sum. */
  lineItemValueField?: string;
  /** Optional flag used to exclude renewal line items from net-new. */
  lineItemRenewalFilterField?: string;
  /** Query Opportunity for a separate renewals section. */
  useRenewals: boolean;
  /** The boolean that marks an opportunity as a renewal. */
  renewalFlagField?: string;
  /** Renewal value fields present, in preference order. May be empty — Amount is standard. */
  renewalValueFields: string[];
  /** Field used to classify renewals into product categories, when present. */
  segmentationField?: string;
  /** Secondary classification field, when present. */
  useCaseField?: string;
  /** Territory field to group by, when the org has one. */
  territoryField?: string;
  /** Human-readable notes about sections that could not be built. */
  unavailable: string[];
}

const LINE_ITEM_VALUE_FIELD = 'FYB_Total_Price__c';
const LINE_ITEM_RENEWAL_FLAG = 'Subscription_Renewal__c';
const RENEWAL_FLAG_FIELD = 'Renewal__c';
const RENEWAL_VALUE_FIELDS = ['True_ACV__c', 'Upsell_ACV__c'];
const SEGMENTATION_FIELD = 'Product_Segmentation__c';
const USE_CASE_FIELD = 'Use_Case_Category__c';

/** Present when the catalog is unknown, so an undiscovered org is not downgraded. */
function has(catalog: string[] | undefined, field: string): boolean {
  return catalog === undefined || catalog.includes(field);
}

/** Only when the catalog is known — an optional extra is not worth guessing at. */
function definitelyHas(catalog: string[] | undefined, field: string): boolean {
  return catalog !== undefined && catalog.includes(field);
}

export function planPipelineQueries(caps: OrgCapabilities): PipelinePlan {
  const unavailable: string[] = [];

  // An undescribed org keeps today's behaviour: attempt the query, and let the existing
  // Opportunity-level path pick up the pieces if it fails. Assuming incapability instead would
  // silently downgrade a report that works.
  const useLineItems = has(caps.lineItemFields, LINE_ITEM_VALUE_FIELD);
  if (!useLineItems) {
    unavailable.push(
      `SKU-level breakdown: OpportunityLineItem has no \`${LINE_ITEM_VALUE_FIELD}\` in this org, so figures come from Opportunity.Amount instead.`,
    );
  }

  const useRenewals = has(caps.opportunityFields, RENEWAL_FLAG_FIELD);
  if (!useRenewals) {
    unavailable.push(
      `Renewals section: Opportunity has no \`${RENEWAL_FLAG_FIELD}\` in this org, so renewals cannot be separated from new business.`,
    );
  }

  return {
    useLineItems,
    lineItemValueField: useLineItems ? LINE_ITEM_VALUE_FIELD : undefined,
    lineItemRenewalFilterField:
      useLineItems && has(caps.lineItemFields, LINE_ITEM_RENEWAL_FLAG) ? LINE_ITEM_RENEWAL_FLAG : undefined,
    useRenewals,
    renewalFlagField: useRenewals ? RENEWAL_FLAG_FIELD : undefined,
    // Selected only when known to exist: naming an absent field fails the whole query, and
    // Amount (standard) is always a workable fallback value.
    renewalValueFields: useRenewals ? RENEWAL_VALUE_FIELDS.filter((f) => definitelyHas(caps.opportunityFields, f)) : [],
    segmentationField:
      useRenewals && definitelyHas(caps.opportunityFields, SEGMENTATION_FIELD) ? SEGMENTATION_FIELD : undefined,
    useCaseField: useRenewals && definitelyHas(caps.opportunityFields, USE_CASE_FIELD) ? USE_CASE_FIELD : undefined,
    territoryField: caps.territoryField,
    unavailable,
  };
}
