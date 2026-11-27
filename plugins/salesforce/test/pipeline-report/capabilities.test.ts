import { expect, test } from 'bun:test';
import { planPipelineQueries } from '../../src/pipeline-report/capabilities';
import { standardCapabilities } from '../synthetic';

test('standard schema supports TotalPrice without inferring renewal meaning', () => {
  const plan = planPipelineQueries(standardCapabilities);
  expect(plan.useLineItems).toBe(true);
  expect(plan.lineItemValueField).toBe('TotalPrice');
  expect(plan.useRenewals).toBe(false);
});
test('an undescribed org fails closed instead of guessing custom schema', () => {
  expect(() => planPipelineQueries({})).toThrow('schema');
});
test('optional line-item access is explicit', () => {
  const plan = planPipelineQueries({ ...standardCapabilities, lineItemFields: [] });
  expect(plan.useLineItems).toBe(false);
  expect(plan.unavailable.join(' ')).toContain('Product breakdown');
});
test('confirmed custom amount and renewal mappings replace standard defaults', () => {
  const plan = planPipelineQueries(
    {
      ...standardCapabilities,
      opportunityFields: [...standardCapabilities.opportunityFields, 'SyntheticAmount__c', 'Flag__c'],
      lineItemFields: ['Id', 'SyntheticPrice__c'],
    },
    {
      opportunityAmount: 'Opportunity.SyntheticAmount__c',
      lineItemAmount: 'OpportunityLineItem.SyntheticPrice__c',
      renewal: { field: 'Opportunity.Flag__c', value: true },
      productGroups: [],
    },
  );
  expect(plan.opportunityValueField).toBe('SyntheticAmount__c');
  expect(plan.lineItemValueField).toBe('SyntheticPrice__c');
  expect(plan.useRenewals).toBe(true);
});
test('a confirmed absent amount mapping cannot produce a report', () => {
  expect(() =>
    planPipelineQueries(standardCapabilities, { opportunityAmount: 'Opportunity.Absent__c', productGroups: [] }),
  ).toThrow();
});
