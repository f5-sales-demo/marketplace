import { beforeEach, describe, expect, it } from 'bun:test';
import {
  buildSalesforceHint,
  getLoadProfile,
  type SalesforceContext,
  salesforceContextIsStale,
  setLoadProfile,
} from '../../src/context/salesforce-context';

describe('setLoadProfile / getLoadProfile', () => {
  beforeEach(() => {
    setLoadProfile(null as any);
  });

  it('returns null when no profile loader is set', () => {
    expect(getLoadProfile()).toBeNull();
  });

  it('stores and retrieves a profile loader', () => {
    const loader = async () => ({ givenName: 'Test' });
    setLoadProfile(loader);
    expect(getLoadProfile()).toBe(loader);
  });
});

describe('salesforceContextIsStale', () => {
  it('returns true when collectedAt is missing', () => {
    expect(salesforceContextIsStale({ userId: 'x' } as any)).toBe(true);
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
      username: 'user@test.com',
      instanceUrl: 'https://test.salesforce.com',
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx);
    expect(hint).toBeUndefined();
  });

  it('builds hint with pipeline data', () => {
    const ctx: SalesforceContext = {
      userId: '005xxx',
      username: 'user@test.com',
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
        { name: 'Acme', oppCount: 3 },
        { name: 'Globex', oppCount: 2 },
      ],
      collectedAt: new Date().toISOString(),
    };
    const hint = buildSalesforceHint(ctx);
    expect(hint).toBeDefined();
    expect(hint?.pipelineTotal).toContain('5.0M');
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
      username: 'user@test.com',
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
      username: 'user@test.com',
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
      username: 'user@test.com',
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
