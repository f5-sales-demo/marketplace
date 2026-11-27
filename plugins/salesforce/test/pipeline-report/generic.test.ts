import { expect, test } from 'bun:test';
import { generatePipelineReport } from '../../src/pipeline-report/generator';

const caps = {
  opportunityFields: [
    'Id',
    'Name',
    'Amount',
    'OwnerId',
    'IsClosed',
    'IsWon',
    'CloseDate',
    'StageName',
    'ForecastCategoryName',
    'CurrencyIsoCode',
  ],
  lineItemFields: [],
  queryable: { Opportunity: true, OpportunityTeamMember: true },
};
const options = {
  userIds: ['005000000000001'],
  orgAlias: 'reader@example.com',
  quarterStart: '2026-11-01',
  quarterEnd: '2027-01-31',
  fiscalYearStart: '2026-02-01',
  fiscalYearEnd: '2027-01-31',
  capabilities: caps,
};
const opp = (Id: string, Amount: number, CurrencyIsoCode = 'USD') => ({
  Id,
  Name: Id,
  Amount,
  CurrencyIsoCode,
  IsClosed: false,
  IsWon: false,
  CloseDate: '2026-12-01',
});
test('owner and team queries deduplicate overlaps and retain unfamiliar amounts', async () => {
  const calls: string[] = [];
  const data = await generatePipelineReport(options, async (query) => {
    calls.push(query);
    return query.includes('WHERE OwnerId')
      ? [opp('006000000000001', 100), opp('006000000000002', 200)]
      : query.includes('OpportunityTeamMember')
        ? [opp('006000000000002', 200), opp('006000000000003', 300)]
        : [];
  });
  expect(data.netNew.total).toBe(600);
  expect(data.netNew.totals.Uncategorized).toBe(600);
  expect(data.netNew.quotaTotal).toBeUndefined();
  expect(data.coverage).toMatchObject({ owner: 2, team: 2, overlap: 1, distinct: 3 });
  expect(calls.join(' ')).not.toMatch(/F5|__c|\bOR\s+Id IN/);
});
test('mixed currencies are reported separately and never summed', async () => {
  const data = await generatePipelineReport(options, async (query) =>
    query.includes('WHERE OwnerId') ? [opp('006000000000001', 100, 'USD'), opp('006000000000002', 200, 'CAD')] : [],
  );
  expect(data.currencyBreakdown?.map((group) => [group.currency, group.netNew.total])).toEqual([
    ['CAD', 200],
    ['USD', 100],
  ]);
  expect(data.netNew.total).toBeUndefined();
});
test('failed mandatory queries never become verified zero', async () => {
  await expect(
    generatePipelineReport(options, async () => {
      throw new Error('REQUEST_LIMIT_EXCEEDED');
    }),
  ).rejects.toThrow('REQUEST_LIMIT_EXCEEDED');
});
test('zero monetary values do not confirm unknown quota eligibility', async () => {
  const data = await generatePipelineReport(options, async (query) =>
    query.includes('WHERE OwnerId') ? [opp('006000000000001', 0)] : [],
  );
  expect(data.netNew.total).toBe(0);
  expect(data.netNew.quotaTotal).toBeUndefined();
});
test('an explicit ineligible group can verify a zero quota amount', async () => {
  const data = await generatePipelineReport(
    {
      ...options,
      mappings: {
        opportunityAmount: 'Opportunity.Amount',
        productGroups: [
          {
            name: 'Known',
            quotaEligible: false,
            rules: [{ field: 'Opportunity.Name', match: 'exact', value: '006000000000001' }],
          },
        ],
      },
    },
    async (query) => (query.includes('WHERE OwnerId') ? [opp('006000000000001', 0)] : []),
  );
  expect(data.netNew.quotaTotal).toBe(0);
});
test('missing optional team access reports owner coverage explicitly', async () => {
  const data = await generatePipelineReport(
    { ...options, capabilities: { ...caps, queryable: { Opportunity: true, OpportunityTeamMember: false } } },
    async () => [opp('006000000000001', 100)],
  );
  expect(data.coverage?.scope).toBe('owner only');
  expect(data.unavailable?.join(' ')).toContain('Team');
  expect(data.netNew.total).toBe(100);
});

test('confirmed relationship amounts are selected and summed using the resolved schema', async () => {
  const calls: string[] = [];
  const data = await generatePipelineReport(
    {
      ...options,
      mappings: { opportunityAmount: 'Opportunity.Account.Budget__c', productGroups: [] },
      capabilities: { ...caps, resolvedFieldPaths: ['Opportunity.Account.Budget__c'] },
    },
    async (query) => {
      calls.push(query);
      return query.includes('WHERE OwnerId') ? [{ ...opp('006000000000001', 100), Account: { Budget__c: 250 } }] : [];
    },
  );
  expect(calls[0]).toContain('Account.Budget__c');
  expect(data.netNew.total).toBe(250);
});

test('optional relationship names are selected only when their paths are supported', async () => {
  for (const supported of [false, true]) {
    const calls: string[] = [];
    const data = await generatePipelineReport(
      {
        ...options,
        capabilities: {
          ...caps,
          opportunityFields: [...caps.opportunityFields, 'AccountId'],
          resolvedFieldPaths: supported ? ['Opportunity.Account.Name', 'Opportunity.Owner.Name'] : [],
        },
      },
      async (query) => {
        calls.push(query);
        return query.includes('WHERE OwnerId')
          ? [
              {
                ...opp('006000000000001', 100),
                Account: { Name: 'Synthetic account' },
                Owner: { Name: 'Synthetic owner' },
              },
            ]
          : [];
      },
    );
    expect(calls[0].includes('Account.Name')).toBe(supported);
    expect(calls[0].includes('Owner.Name')).toBe(supported);
    if (supported) expect(data.topDeals[0].ownerName).toBe('Synthetic owner');
  }
});
