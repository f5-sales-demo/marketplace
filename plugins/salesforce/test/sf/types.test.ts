import { describe, expect, it } from 'bun:test';
import { ORG_ALIAS_PATTERN, SF_ORG_SAFE_FIELDS } from '../../src/sf/types';

describe('ORG_ALIAS_PATTERN', () => {
  it('accepts alphanumeric aliases', () => {
    expect(ORG_ALIAS_PATTERN.test('myOrg123')).toBe(true);
  });

  it('accepts dots, underscores, hyphens, and @', () => {
    expect(ORG_ALIAS_PATTERN.test('my.org_name-1@test')).toBe(true);
  });

  it('rejects spaces', () => {
    expect(ORG_ALIAS_PATTERN.test('my org')).toBe(false);
  });

  it('rejects shell injection characters', () => {
    expect(ORG_ALIAS_PATTERN.test('org;rm -rf /')).toBe(false);
    expect(ORG_ALIAS_PATTERN.test('org$(whoami)')).toBe(false);
    expect(ORG_ALIAS_PATTERN.test('org`id`')).toBe(false);
    expect(ORG_ALIAS_PATTERN.test('org|cat /etc/passwd')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(ORG_ALIAS_PATTERN.test('')).toBe(false);
  });
});

describe('SF_ORG_SAFE_FIELDS', () => {
  it('contains expected whitelisted fields', () => {
    expect(SF_ORG_SAFE_FIELDS).toContain('username');
    expect(SF_ORG_SAFE_FIELDS).toContain('orgId');
    expect(SF_ORG_SAFE_FIELDS).toContain('instanceUrl');
    expect(SF_ORG_SAFE_FIELDS).toContain('connectedStatus');
    expect(SF_ORG_SAFE_FIELDS).toContain('alias');
  });

  it('does not contain sensitive fields', () => {
    const fields = SF_ORG_SAFE_FIELDS as readonly string[];
    expect(fields).not.toContain('accessToken');
    expect(fields).not.toContain('refreshToken');
    expect(fields).not.toContain('password');
  });
});
