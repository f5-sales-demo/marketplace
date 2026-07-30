import { describe, expect, it } from 'bun:test';
import { planPipelineQueries } from '../../src/pipeline-report/capabilities';

// The Opportunity/OpportunityLineItem fields the report used to assume every org has. They are
// one org's customizations; nothing in Salesforce guarantees any of them.
const RICH_OPPORTUNITY = [
  'Id',
  'Name',
  'Amount',
  'CloseDate',
  'ForecastCategoryName',
  'StageName',
  'IsClosed',
  'IsWon',
  'Renewal__c',
  'True_ACV__c',
  'Upsell_ACV__c',
  'Product_Segmentation__c',
  'Use_Case_Category__c',
];
const RICH_LINE_ITEM = ['Id', 'Quantity', 'FYB_Total_Price__c', 'Subscription_Renewal__c'];

// A stock org: standard fields only, no custom schema at all.
const BARE_OPPORTUNITY = [
  'Id',
  'Name',
  'Amount',
  'CloseDate',
  'ForecastCategoryName',
  'StageName',
  'IsClosed',
  'IsWon',
];
const BARE_LINE_ITEM = ['Id', 'Quantity', 'UnitPrice', 'TotalPrice'];

describe('planPipelineQueries — a richly customized org', () => {
  const plan = planPipelineQueries({
    opportunityFields: RICH_OPPORTUNITY,
    lineItemFields: RICH_LINE_ITEM,
    territoryField: 'ETM_Core_Territory__c',
  });

  it('uses the line-item path', () => {
    expect(plan.useLineItems).toBe(true);
    expect(plan.lineItemValueField).toBe('FYB_Total_Price__c');
    expect(plan.lineItemRenewalFilterField).toBe('Subscription_Renewal__c');
  });

  it('uses the renewals path with every optional field it found', () => {
    expect(plan.useRenewals).toBe(true);
    expect(plan.renewalFlagField).toBe('Renewal__c');
    expect(plan.renewalValueFields).toEqual(['True_ACV__c', 'Upsell_ACV__c']);
    expect(plan.segmentationField).toBe('Product_Segmentation__c');
    expect(plan.useCaseField).toBe('Use_Case_Category__c');
  });

  it('carries the resolved territory field through', () => {
    expect(plan.territoryField).toBe('ETM_Core_Territory__c');
  });

  it('reports nothing as unavailable', () => {
    expect(plan.unavailable).toEqual([]);
  });
});

describe('planPipelineQueries — a stock org', () => {
  const plan = planPipelineQueries({
    opportunityFields: BARE_OPPORTUNITY,
    lineItemFields: BARE_LINE_ITEM,
  });

  it('skips the line-item path rather than issuing a query that must fail', () => {
    expect(plan.useLineItems).toBe(false);
    expect(plan.lineItemValueField).toBeUndefined();
  });

  it('skips renewals', () => {
    expect(plan.useRenewals).toBe(false);
    expect(plan.renewalValueFields).toEqual([]);
  });

  it('has no territory field', () => {
    expect(plan.territoryField).toBeUndefined();
  });

  it('says which sections are unavailable and names the missing field', () => {
    const notes = plan.unavailable.join(' ');
    expect(plan.unavailable).toHaveLength(2);
    expect(notes).toContain('SKU-level');
    expect(notes).toContain('FYB_Total_Price__c');
    expect(notes).toContain('Renewals section');
    expect(notes).toContain('Renewal__c');
  });
});

describe('planPipelineQueries — partial customization', () => {
  it('keeps line items when the value field exists but the renewal filter does not', () => {
    const plan = planPipelineQueries({
      opportunityFields: BARE_OPPORTUNITY,
      lineItemFields: ['Id', 'FYB_Total_Price__c'],
    });
    expect(plan.useLineItems).toBe(true);
    expect(plan.lineItemRenewalFilterField).toBeUndefined();
  });

  it('keeps renewals on the flag alone, valuing them by the standard Amount', () => {
    const plan = planPipelineQueries({
      opportunityFields: [...BARE_OPPORTUNITY, 'Renewal__c'],
      lineItemFields: BARE_LINE_ITEM,
    });
    expect(plan.useRenewals).toBe(true);
    expect(plan.renewalValueFields).toEqual([]);
    expect(plan.segmentationField).toBeUndefined();
  });

  it('takes whichever ACV fields exist, not all or nothing', () => {
    const plan = planPipelineQueries({
      opportunityFields: [...BARE_OPPORTUNITY, 'Renewal__c', 'Upsell_ACV__c'],
      lineItemFields: BARE_LINE_ITEM,
    });
    expect(plan.renewalValueFields).toEqual(['Upsell_ACV__c']);
  });
});

describe('planPipelineQueries — an undiscovered org', () => {
  // No catalog means the context probe has not run or is stale. Assuming capability preserves
  // the behaviour orgs already have: the query is attempted, and a failure falls through to the
  // Opportunity-level path. Assuming incapability would silently downgrade a working report.
  it('attempts both paths when nothing is known', () => {
    const plan = planPipelineQueries({});
    expect(plan.useLineItems).toBe(true);
    expect(plan.useRenewals).toBe(true);
    expect(plan.unavailable).toEqual([]);
  });

  it('still attempts when only one object was described', () => {
    expect(planPipelineQueries({ opportunityFields: BARE_OPPORTUNITY }).useLineItems).toBe(true);
    expect(planPipelineQueries({ lineItemFields: BARE_LINE_ITEM }).useRenewals).toBe(true);
  });
});
