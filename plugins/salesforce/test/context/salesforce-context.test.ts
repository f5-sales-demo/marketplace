import { beforeEach, describe, expect, it } from 'bun:test';
import {
  buildSalesforceHint,
  configurePersonProfile,
  readPersonFacts,
  renderSalesforceContextMarkdown,
  type SalesforceContext,
  salesforceContextIsStale,
} from '../../src/context/salesforce-context';

describe('canonical person profile access', () => {
  beforeEach(() => {
    configurePersonProfile();
  });

  it('fails clearly when the host API is unavailable', async () => {
    await expect(readPersonFacts()).rejects.toThrow('requires the xcsh personProfile API');
  });

  it('reads facts through the configured canonical API', async () => {
    configurePersonProfile(async () => ({ givenName: 'Synthetic' }));
    expect(await readPersonFacts()).toEqual({ givenName: 'Synthetic' });
  });
});

describe('salesforceContextIsStale', () => {
  it('returns true when collectedAt is missing', () => {
    // A context with no `fetchedAt` is stale by definition — that is the case under test.
    expect(salesforceContextIsStale({ userId: 'x' } as Parameters<typeof salesforceContextIsStale>[0])).toBe(true);
  });

  it('returns true when older than 4 hours', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(salesforceContextIsStale({ collectedAt: fiveHoursAgo } as SalesforceContext)).toBe(true);
  });

  it('returns false when within 4 hours', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(salesforceContextIsStale({ collectedAt: oneHourAgo } as SalesforceContext)).toBe(false);
  });
});

describe('buildSalesforceHint', () => {
  it('returns undefined when context is null', () => {
    const hint = buildSalesforceHint(null);
    expect(hint).toBeUndefined();
  });

  it('returns undefined when no pipeline summary', () => {
    const ctx: SalesforceContext = {
      userId: '005xxx',
      username: 'user@example.com',
      instanceUrl: 'https://test.salesforce.com',
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx);
    expect(hint).toBeUndefined();
  });

  it('builds hint with pipeline data', () => {
    const ctx: SalesforceContext = {
      userId: '005xxx',
      username: 'user@example.com',
      instanceUrl: 'https://test.salesforce.com',
      orgAlias: 'SFDC',
      pipelineSummary: {
        total: 5000000,
        dealCount: 25,
        byForecast: {
          Commit: { amount: 2000000, count: 5 },
          'Best Case': { amount: 1500000, count: 8 },
          Pipeline: { amount: 1500000, count: 12 },
        },
      },
      territories: ['West', 'Central'],
      activeAccounts: [
        { name: 'Example Corp', oppCount: 3 },
        { name: 'Globex', oppCount: 2 },
      ],
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx);
    expect(hint).toBeDefined();
    expect(hint?.pipelineTotal).toContain('5,000,000');
    expect(hint?.dealCount).toBe(25);
    expect(hint?.accountCount).toBe(2);
    expect(hint?.orgAlias).toBe('SFDC');
    expect(hint?.forecastBreakdown).toContain('Commit');
    expect(hint?.forecastBreakdown).toContain('BC');
    expect(hint?.forecastBreakdown).toContain('Pipe');
  });

  it('includes partner info from discovered partner', () => {
    const ctx: SalesforceContext = {
      userId: '005xxx',
      username: 'user@example.com',
      instanceUrl: 'https://test.salesforce.com',
      discoveredPartner: { id: '005yyy', name: 'Jane AE', role: 'AE' },
      pipelineSummary: {
        total: 1000000,
        dealCount: 5,
        byForecast: {},
      },
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx);
    expect(hint).toBeDefined();
    expect(hint?.partnerName).toContain('Jane AE');
    expect(hint?.partnerRole).toBe('AE');
    expect(hint?.partnerId).toBe('005yyy');
  });

  it('marks discovered partner as unconfirmed', () => {
    const ctx: SalesforceContext = {
      userId: '005xxx',
      username: 'user@example.com',
      instanceUrl: 'https://test.salesforce.com',
      discoveredPartner: { id: '005yyy', name: 'Jane', role: 'AE' },
      pipelineSummary: { total: 100, dealCount: 1, byForecast: {} },
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx);
    expect(hint?.partnerName).toContain('unconfirmed');
  });

  it('uses profile partner over discovered partner', () => {
    const ctx: SalesforceContext = {
      userId: '005xxx',
      username: 'user@example.com',
      instanceUrl: 'https://test.salesforce.com',
      discoveredPartner: { id: '005yyy', name: 'Discovered', role: 'AE' },
      pipelineSummary: { total: 100, dealCount: 1, byForecast: {} },
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx, {
      partner: { id: '005zzz', name: 'Profile Partner', role: 'SE' },
    });
    expect(hint?.partnerName).toBe('Profile Partner');
    expect(hint?.partnerName).not.toContain('unconfirmed');
  });
});

it('lifecycle hint never invents a dollar unit for aggregate amounts without currency evidence', () => {
  const ctx = {
    userId: '005000000000001',
    username: 'synthetic@example.com',
    instanceUrl: 'https://example.com',
    collectedAt: new Date().toISOString(),
    pipelineSummary: {
      total: 1234567.89,
      dealCount: 2,
      byForecast: { Commit: { amount: 1234567.89, count: 1 }, Pipeline: { amount: 0, count: 1 } },
    },
  };
  const hint = buildSalesforceHint(ctx);
  expect(hint?.pipelineTotal).toContain('Currency unknown');
  expect(hint?.pipelineTotal).not.toContain('$');
  expect(hint?.forecastBreakdown).not.toContain('$');
  expect(hint?.pipelineTotal).toContain('1,234,567.89');
  const markdown = renderSalesforceContextMarkdown(ctx);
  expect(markdown).toContain('| Commit | Currency unknown: 1,234,567.89 | 1 |');
  expect(markdown).toContain('| Pipeline | Currency unknown: 0 | 1 |');
  expect(markdown).not.toContain('$');
});
