import { expect, test } from 'bun:test';
import { generatePipelineReport } from '../../src/pipeline-report/generator';
import { renderPipelineReport } from '../../src/pipeline-report/renderer';
import { standardCapabilities, syntheticOpportunity, syntheticPeriods } from '../synthetic';

const options = {
  userIds: ['005000000000001'],
  orgAlias: 'reader@example.com',
  quarterStart: syntheticPeriods[0].StartDate,
  quarterEnd: syntheticPeriods[0].EndDate,
  fiscalYearStart: syntheticPeriods[1].StartDate,
  fiscalYearEnd: syntheticPeriods[1].EndDate,
  capabilities: standardCapabilities,
};

test('standard-only pipeline retains zero, negative and unfamiliar amounts in opportunity totals', async () => {
  const data = await generatePipelineReport(options, async (q) =>
    q.includes('WHERE OwnerId')
      ? [
          syntheticOpportunity(),
          syntheticOpportunity('006000000000002', 0),
          syntheticOpportunity('006000000000003', -10),
        ]
      : [],
  );
  expect(data.netNew.total).toBe(90);
  expect(data.netNew.totals.Uncategorized).toBe(90);
  expect(data.topDeals).toHaveLength(3);
  expect(data.renewals).toBeUndefined();
  expect(renderPipelineReport(data, '')).toContain('Unknown');
});
test('confirmed products use line-item values without replacing opportunity amounts or losing unclassified amounts', async () => {
  const mappings = {
    opportunityAmount: 'Opportunity.Amount',
    lineItemAmount: 'OpportunityLineItem.TotalPrice',
    productGroups: [
      {
        name: 'Services',
        quotaEligible: true,
        rules: [{ field: 'Product2.Name', match: 'prefix' as const, value: 'Service' }],
      },
    ],
  };
  const data = await generatePipelineReport({ ...options, mappings }, async (q) =>
    q.includes('FROM OpportunityLineItem')
      ? [
          {
            Id: '00k000000000001',
            OpportunityId: '006000000000001',
            TotalPrice: 25,
            Product2: { Name: 'Service annual' },
          },
          { Id: '00k000000000002', OpportunityId: '006000000000001', TotalPrice: 10, Product2: { Name: 'Unfamiliar' } },
        ]
      : q.includes('WHERE OwnerId')
        ? [syntheticOpportunity()]
        : [],
  );
  expect(data.netNew.total).toBe(100);
  expect(data.productBreakdown?.total).toBe(35);
  expect(data.productBreakdown?.totals).toMatchObject({ Services: 25, Uncategorized: 10 });
  expect(data.productBreakdown?.quotaTotal).toBeUndefined();
});
test('overlapping group rules remain unclassified and exact matches preserve case', async () => {
  const data = await generatePipelineReport(
    {
      ...options,
      mappings: {
        opportunityAmount: 'Opportunity.Amount',
        productGroups: ['A', 'B'].map((name) => ({
          name,
          quotaEligible: true,
          rules: [{ field: 'Opportunity.Name', match: 'exact' as const, value: 'Synthetic opportunity' }],
        })),
      },
    },
    async (q) => (q.includes('WHERE OwnerId') ? [syntheticOpportunity()] : []),
  );
  expect(data.netNew.totals.Uncategorized).toBe(100);
  expect(data.netNew.quotaTotal).toBeUndefined();
});
test('confirmed opportunity renewal predicates and custom values are honored with complete summaries', async () => {
  const data = await generatePipelineReport(
    {
      ...options,
      capabilities: {
        ...standardCapabilities,
        opportunityFields: [...standardCapabilities.opportunityFields, 'Flag__c', 'SyntheticAmount__c'],
      },
      mappings: {
        opportunityAmount: 'Opportunity.SyntheticAmount__c',
        renewal: { field: 'Opportunity.Flag__c', value: true },
        productGroups: [],
      },
    },
    async (q) =>
      q.includes('WHERE OwnerId')
        ? [
            syntheticOpportunity('006000000000001', 1, {
              Flag__c: true,
              SyntheticAmount__c: 200,
              StageName: 'Validation',
              NextStep: 'Confirm terms',
            }),
          ]
        : [],
  );
  expect(data.netNew.total).toBe(0);
  expect(data.renewals?.total).toBe(200);
  expect(data.topRenewals?.[0]).toMatchObject({ amount: 200, stage: 'Validation', nextStep: 'Confirm terms' });
});
test('unavailable fiscal periods leave bookings unavailable while preserving open pipeline', async () => {
  const data = await generatePipelineReport(
    {
      ...options,
      quarterStart: undefined,
      quarterEnd: undefined,
      fiscalYearStart: undefined,
      fiscalYearEnd: undefined,
    },
    async (q) => (q.includes('WHERE OwnerId') ? [syntheticOpportunity()] : []),
  );
  expect(data.netNew.total).toBe(100);
  expect(data.booked).toBeUndefined();
  expect(data.fyBookedTotal).toBeUndefined();
  expect(data.unavailable?.join(' ')).toContain('fiscal periods');
});
test('empty complete queries verify zero open totals with unknown quota meaning', async () => {
  const data = await generatePipelineReport(options, async () => []);
  expect(data.netNew.total).toBe(0);
  expect(data.netNew.quotaTotal).toBeUndefined();
});
test('missing returned amount or status does not become zero or open', async () => {
  for (const record of [syntheticOpportunity('006000000000001', NaN), { Id: '006000000000001', Amount: 100 }])
    await expect(generatePipelineReport(options, async () => [record])).rejects.toThrow();
});
test('quarter and fiscal boundaries cross a year without a guessed fiscal start month', async () => {
  const data = await generatePipelineReport(options, async (q) =>
    q.includes('WHERE OwnerId')
      ? [syntheticOpportunity('006000000000001', 100, { IsClosed: true, IsWon: true, CloseDate: '2026-11-01' })]
      : [],
  );
  expect(data.booked?.total).toBe(100);
  expect(data.fyBookedTotal).toBe(100);
  expect(data.fyLabel).toBe('FY2027');
});
