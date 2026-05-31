import { describe, expect, it } from 'bun:test';
import { SfAuthError, SfExecError, SfNoDefaultOrgError, SfQueryError, SfSessionExpiredError } from '../../src/sf/exec';
import { collectAllOrgs, detectErrorType, errorResult, normalizeOrg, textResult } from '../../src/tools/shared';

describe('textResult', () => {
  it('returns text content with details', () => {
    const result = textResult('hello', { tool: 'sf_setup' });
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(result.details.tool).toBe('sf_setup');
    expect(result.isError).toBeUndefined();
  });
});

describe('errorResult', () => {
  it('returns error content with isError flag', () => {
    const result = errorResult('failed', { tool: 'sf_query' });
    expect(result.content).toEqual([{ type: 'text', text: 'failed' }]);
    expect(result.isError).toBe(true);
    expect(result.details.tool).toBe('sf_query');
  });
});

describe('detectErrorType', () => {
  it('maps SfAuthError to auth_required', () => {
    expect(detectErrorType(new SfAuthError())).toBe('auth_required');
  });

  it('maps SfSessionExpiredError to session_expired', () => {
    expect(detectErrorType(new SfSessionExpiredError())).toBe('session_expired');
  });

  it('maps SfNoDefaultOrgError to no_default_org', () => {
    expect(detectErrorType(new SfNoDefaultOrgError())).toBe('no_default_org');
  });

  it('maps SfQueryError to invalid_query', () => {
    expect(detectErrorType(new SfQueryError('bad', 'SELECT x'))).toBe('invalid_query');
  });

  it('maps unknown errors to exec_error', () => {
    expect(detectErrorType(new Error('random'))).toBe('exec_error');
    expect(detectErrorType(new SfExecError('fail', 1))).toBe('exec_error');
    expect(detectErrorType('string error')).toBe('exec_error');
  });
});

describe('normalizeOrg', () => {
  it('normalizes standard org fields', () => {
    const org = normalizeOrg({
      alias: 'prod',
      username: 'admin@prod.com',
      orgId: '00D123',
      instanceUrl: 'https://prod.my.salesforce.com',
      connectedStatus: 'Connected',
      isDefaultUsername: true,
      isSandbox: false,
    });
    expect(org.alias).toBe('prod');
    expect(org.username).toBe('admin@prod.com');
    expect(org.orgId).toBe('00D123');
    expect(org.isDefault).toBe(true);
    expect(org.isSandbox).toBe(false);
  });

  it('handles lowercase orgid field', () => {
    const org = normalizeOrg({
      username: 'user@test.com',
      orgid: '00D456',
      instanceUrl: 'https://test.salesforce.com',
    });
    expect(org.orgId).toBe('00D456');
  });

  it('detects default from defaultMarker (U)', () => {
    const org = normalizeOrg({
      username: 'user@test.com',
      orgId: '00D789',
      instanceUrl: 'https://test.salesforce.com',
      defaultMarker: '(U)',
    });
    expect(org.isDefault).toBe(true);
  });

  it('defaults connectedStatus to Unknown', () => {
    const org = normalizeOrg({
      username: 'user@test.com',
      orgId: '00D000',
      instanceUrl: 'https://test.salesforce.com',
    });
    expect(org.connectedStatus).toBe('Unknown');
  });
});

describe('collectAllOrgs', () => {
  const makeOrg = (id: string, username: string) => ({
    username,
    orgId: id,
    instanceUrl: 'https://test.salesforce.com',
    connectedStatus: 'Connected',
  });

  it('collects from all org categories', () => {
    const orgs = collectAllOrgs({
      nonScratchOrgs: [makeOrg('001', 'a@test.com')],
      scratchOrgs: [makeOrg('002', 'b@test.com')],
      sandboxes: [makeOrg('003', 'c@test.com')],
      devHubs: [makeOrg('004', 'd@test.com')],
      other: [makeOrg('005', 'e@test.com')],
    });
    expect(orgs).toHaveLength(5);
  });

  it('deduplicates by orgId', () => {
    const orgs = collectAllOrgs({
      nonScratchOrgs: [makeOrg('001', 'a@test.com')],
      scratchOrgs: [makeOrg('001', 'a@test.com')],
    });
    expect(orgs).toHaveLength(1);
  });

  it('handles missing categories', () => {
    const orgs = collectAllOrgs({ nonScratchOrgs: [makeOrg('001', 'a@test.com')] });
    expect(orgs).toHaveLength(1);
  });

  it('handles empty input', () => {
    const orgs = collectAllOrgs({});
    expect(orgs).toHaveLength(0);
  });
});
