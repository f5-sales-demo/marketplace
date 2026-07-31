import { describe, expect, it } from 'bun:test';
import { generatePipelineReport } from '../../src/pipeline-report/generator';
import type { PipelineReportOptions } from '../../src/pipeline-report/types';

// Records every SOQL the generator issues, so a test can assert what was NOT asked for as well
// as what came back. `respond` maps a query to its rows; anything unmatched returns [].
function recordingQuery(respond: (soql: string) => Record<string, unknown>[] | undefined) {
  const queries: string[] = [];
  const fn = async (soql: string) => {
    queries.push(soql);
    return respond(soql) ?? [];
  };
  return { fn, queries };
}

const BASE: PipelineReportOptions = {
  userIds: ['005000000000001'],
  quarterStart: '2026-05-01',
  quarterEnd: '2026-07-31',
};

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

function oppRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: '006000000000001',
    Name: 'Acme Expansion',
    Account: { Name: 'Acme' },
    Amount: 120000,
    ForecastCategoryName: 'Commit',
    StageName: 'Negotiation',
    CloseDate: '2026-06-15',
    Owner: { Name: 'Dana Reyes' },
    IsClosed: false,
    IsWon: false,
    ...over,
  };
}

describe('generatePipelineReport — an org without the custom schema', () => {
  const capabilities = { opportunityFields: BARE_OPPORTUNITY, lineItemFields: BARE_LINE_ITEM };

  it('never issues a query naming a field the org does not have', async () => {
    const { fn, queries } = recordingQuery((soql) =>
      soql.includes('FROM Opportunity ') && soql.includes('IsClosed = false') ? [oppRow()] : undefined,
    );
    await generatePipelineReport({ ...BASE, capabilities }, fn);

    const all = queries.join('\n');
    for (const field of [
      'FYB_Total_Price__c',
      'Subscription_Renewal__c',
      'Renewal__c',
      'True_ACV__c',
      'Upsell_ACV__c',
      'Product_Segmentation__c',
      'Use_Case_Category__c',
      'Territory_Credited_District_del__c',
    ]) {
      expect(all).not.toContain(field);
    }
  });

  it('does not query OpportunityLineItem at all', async () => {
    const { fn, queries } = recordingQuery(() => undefined);
    await generatePipelineReport({ ...BASE, capabilities }, fn);
    expect(queries.some((q) => q.includes('FROM OpportunityLineItem'))).toBe(false);
  });

  it('still produces a populated report from standard fields', async () => {
    const { fn } = recordingQuery((soql) =>
      soql.includes('FROM Opportunity ') && soql.includes('IsClosed = false') ? [oppRow()] : undefined,
    );
    const data = await generatePipelineReport({ ...BASE, capabilities }, fn);
    expect(data.netNew.accounts.length).toBe(1);
    expect(data.netNew.accounts[0].name).toBe('Acme');
    expect(data.netNew.totals.platform).toBe(120000);
  });

  it('records the sections it could not build, rather than omitting them silently', async () => {
    const { fn } = recordingQuery(() => undefined);
    const data = await generatePipelineReport({ ...BASE, capabilities }, fn);
    expect(data.unavailable?.join(' ')).toContain('renewal');
  });
});

describe('generatePipelineReport — an org with the custom schema', () => {
  const capabilities = {
    opportunityFields: [
      ...BARE_OPPORTUNITY,
      'Renewal__c',
      'True_ACV__c',
      'Upsell_ACV__c',
      'Product_Segmentation__c',
      'Use_Case_Category__c',
    ],
    lineItemFields: ['Id', 'FYB_Total_Price__c', 'Subscription_Renewal__c'],
    territoryField: 'ETM_Core_Territory__c',
  };

  it('queries line items and renewals, and uses the resolved territory field', async () => {
    const { fn, queries } = recordingQuery(() => undefined);
    await generatePipelineReport({ ...BASE, capabilities }, fn);
    const all = queries.join('\n');
    expect(all).toContain('FROM OpportunityLineItem');
    expect(all).toContain('FYB_Total_Price__c');
    expect(all).toContain('Renewal__c');
    expect(all).toContain('ETM_Core_Territory__c');
    // The field this used to hardcode belongs to one org and is not even groupable.
    expect(all).not.toContain('Territory_Credited_District_del__c');
  });

  it('reports nothing as unavailable', async () => {
    const { fn } = recordingQuery(() => undefined);
    const data = await generatePipelineReport({ ...BASE, capabilities }, fn);
    expect(data.unavailable ?? []).toEqual([]);
  });
});

describe('generatePipelineReport — fiscal year', () => {
  it('defaults to a January fiscal year rather than assuming one org calendar', async () => {
    const { fn } = recordingQuery(() => undefined);
    const data = await generatePipelineReport({ ...BASE, capabilities: {} }, fn);
    expect(data.fyLabel).toBe('FY26');
  });

  it('honours a configured fiscal year start month', async () => {
    const { fn, queries } = recordingQuery(() => undefined);
    // November start: a quarter beginning 2026-05-01 falls in the FY that opened 2025-11-01.
    const data = await generatePipelineReport({ ...BASE, capabilities: { fiscalYearStartMonth: 11 } }, fn);
    expect(data.fyLabel).toBe('FY26');
    expect(queries.join('\n')).toContain('2025-11-01');
  });
});
