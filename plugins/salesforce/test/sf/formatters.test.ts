import { describe, expect, it } from 'bun:test';
import {
  deriveQueryLabel,
  flattenRecord,
  formatOrgDetail,
  formatOrgTable,
  formatQueryResults,
} from '../../src/sf/formatters';
import type { SfOrg, SfQueryResult } from '../../src/sf/types';

describe('deriveQueryLabel', () => {
  it("returns 'query' for empty string", () => {
    expect(deriveQueryLabel('')).toBe('query');
  });

  it('detects forecast breakdown', () => {
    expect(
      deriveQueryLabel('SELECT ForecastCategoryName, COUNT(Id) FROM Opportunity GROUP BY ForecastCategoryName'),
    ).toBe('forecast breakdown');
  });

  it('detects object from FROM clause', () => {
    expect(deriveQueryLabel('SELECT Id FROM Opportunity')).toBe('opportunities');
    expect(deriveQueryLabel('SELECT Id FROM Account')).toBe('accounts');
    expect(deriveQueryLabel('SELECT Id FROM Contact')).toBe('contacts');
    expect(deriveQueryLabel('SELECT Id FROM Case')).toBe('cases');
  });

  it('detects closed-won qualifier', () => {
    expect(deriveQueryLabel('SELECT Id FROM Opportunity WHERE IsWon = TRUE')).toBe('closed-won opportunities');
  });

  it('detects open qualifier', () => {
    expect(deriveQueryLabel('SELECT Id FROM Opportunity WHERE IsClosed = FALSE')).toBe('open opportunities');
  });

  it('detects renewal qualifier', () => {
    expect(deriveQueryLabel("SELECT Id FROM Opportunity WHERE Type = 'Renewal'")).toBe('renewals opportunities');
  });

  it('detects this fiscal quarter scope', () => {
    expect(deriveQueryLabel('SELECT Id FROM Opportunity WHERE CloseDate = THIS_FISCAL_QUARTER')).toBe(
      'opportunities (this quarter)',
    );
  });

  it('detects last fiscal quarter scope', () => {
    expect(deriveQueryLabel('SELECT Id FROM Opportunity WHERE CloseDate = LAST_FISCAL_QUARTER')).toBe(
      'opportunities (last quarter)',
    );
  });

  it('detects GROUP BY as summary', () => {
    expect(deriveQueryLabel('SELECT StageName, COUNT(Id) FROM Opportunity GROUP BY StageName')).toBe(
      'opportunities summary',
    );
  });

  it('handles unknown objects', () => {
    expect(deriveQueryLabel('SELECT Id FROM CustomObject__c')).toBe('customobject__c');
  });
});

describe('formatOrgTable', () => {
  it("returns 'no orgs' message for empty array", () => {
    expect(formatOrgTable([])).toBe('No authenticated orgs found.');
  });

  it('renders markdown table with header', () => {
    const orgs: SfOrg[] = [
      {
        alias: 'test',
        username: 'user@test.com',
        orgId: '00D000000000001',
        instanceUrl: 'https://test.my.salesforce.com',
        connectedStatus: 'Connected',
        isDefault: false,
        isSandbox: false,
      },
    ];
    const table = formatOrgTable(orgs);
    expect(table).toContain('| Alias |');
    expect(table).toContain('| test |');
    expect(table).toContain('user@test.com');
  });

  it('marks default org', () => {
    const orgs: SfOrg[] = [
      {
        alias: 'prod',
        username: 'admin@prod.com',
        orgId: '00D000000000002',
        instanceUrl: 'https://prod.my.salesforce.com',
        connectedStatus: 'Connected',
        isDefault: true,
        isSandbox: false,
      },
    ];
    const table = formatOrgTable(orgs);
    expect(table).toContain('prod (default)');
  });

  it('shows (none) when alias is undefined', () => {
    const orgs: SfOrg[] = [
      {
        username: 'user@test.com',
        orgId: '00D000000000003',
        instanceUrl: 'https://test.my.salesforce.com',
        connectedStatus: 'Connected',
        isDefault: false,
        isSandbox: false,
      },
    ];
    const table = formatOrgTable(orgs);
    expect(table).toContain('(none)');
  });
});

describe('formatOrgDetail', () => {
  it('renders org details', () => {
    const org: SfOrg = {
      alias: 'myOrg',
      username: 'admin@example.com',
      orgId: '00D123',
      instanceUrl: 'https://example.my.salesforce.com',
      connectedStatus: 'Connected',
      isDefault: true,
      isSandbox: false,
    };
    const detail = formatOrgDetail(org);
    expect(detail).toContain('**myOrg**');
    expect(detail).toContain('Username: admin@example.com');
    expect(detail).toContain('Org ID: 00D123');
    expect(detail).toContain('Default: yes');
  });

  it('shows sandbox type', () => {
    const org: SfOrg = {
      username: 'user@sandbox.com',
      orgId: '00D456',
      instanceUrl: 'https://test.sandbox.my.salesforce.com',
      connectedStatus: 'Connected',
      isDefault: false,
      isSandbox: true,
    };
    const detail = formatOrgDetail(org);
    expect(detail).toContain('Type: Sandbox');
  });

  it('uses username when alias is undefined', () => {
    const org: SfOrg = {
      username: 'fallback@test.com',
      orgId: '00D789',
      instanceUrl: 'https://test.my.salesforce.com',
      connectedStatus: 'Connected',
      isDefault: false,
      isSandbox: false,
    };
    const detail = formatOrgDetail(org);
    expect(detail).toContain('**fallback@test.com**');
  });
});

describe('flattenRecord', () => {
  it('flattens nested objects with dot notation', () => {
    const record = { Account: { Name: 'Acme', Id: '001' }, Amount: 1000 };
    const flat = flattenRecord(record);
    expect(flat['Account.Name']).toBe('Acme');
    expect(flat['Account.Id']).toBe('001');
    expect(flat.Amount).toBe(1000);
  });

  it('skips attributes key', () => {
    const record = { attributes: { type: 'Opportunity' }, Name: 'Deal' };
    const flat = flattenRecord(record);
    expect(flat.attributes).toBeUndefined();
    expect(flat.Name).toBe('Deal');
  });

  it('skips nested attributes key', () => {
    const record = { Account: { attributes: { type: 'Account' }, Name: 'Acme' } };
    const flat = flattenRecord(record);
    expect(flat['Account.attributes']).toBeUndefined();
    expect(flat['Account.Name']).toBe('Acme');
  });

  it('skips null values', () => {
    const record = { Name: 'Deal', Amount: null };
    const flat = flattenRecord(record);
    expect(flat.Name).toBe('Deal');
    expect('Amount' in flat).toBe(false);
  });

  it('keeps arrays as-is', () => {
    const record = { Tags: ['a', 'b'] };
    const flat = flattenRecord(record);
    expect(flat.Tags).toEqual(['a', 'b']);
  });
});

describe('formatQueryResults', () => {
  it("returns 'no records' for empty results", () => {
    const result: SfQueryResult = { totalSize: 0, done: true, records: [] };
    expect(formatQueryResults(result)).toBe('No records found.');
  });

  it('renders markdown table with record count', () => {
    const result: SfQueryResult = {
      totalSize: 2,
      done: true,
      records: [
        { Name: 'Deal A', Amount: 10000 },
        { Name: 'Deal B', Amount: 20000 },
      ],
    };
    const output = formatQueryResults(result);
    expect(output).toContain('2 records returned.');
    expect(output).toContain('| Name | Amount |');
    expect(output).toContain('Deal A');
    expect(output).toContain('20000');
  });

  it('flattens nested records in table', () => {
    const result: SfQueryResult = {
      totalSize: 1,
      done: true,
      records: [{ attributes: { type: 'Opportunity' }, Account: { Name: 'Acme' }, Amount: 5000 }],
    };
    const output = formatQueryResults(result);
    expect(output).toContain('Account.Name');
    expect(output).toContain('Acme');
    expect(output).not.toContain('attributes');
  });

  it('handles records with differing columns', () => {
    const result: SfQueryResult = {
      totalSize: 2,
      done: true,
      records: [
        { Name: 'A', Stage: 'Open' },
        { Name: 'B', Amount: 100 },
      ],
    };
    const output = formatQueryResults(result);
    expect(output).toContain('| Name | Stage | Amount |');
  });
});
