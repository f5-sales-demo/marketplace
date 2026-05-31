import { beforeEach, describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { setLoadProfile } from '../../src/context/salesforce-context';
import { createSfSetupTool } from '../../src/tools/sf-setup';

const mockPi = { typebox: { Type }, logger: { debug() {} } };

describe('createSfSetupTool', () => {
  it('returns a tool definition with correct name and label', () => {
    const tool = createSfSetupTool(mockPi);
    expect(tool.name).toBe('sf_setup');
    expect(tool.label).toBe('Salesforce Setup');
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeTruthy();
  });

  it('has description loaded from prompt template', () => {
    const tool = createSfSetupTool(mockPi);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(50);
  });
});

describe('sf_setup execute — validation', () => {
  beforeEach(() => {
    setLoadProfile(async () => ({ givenName: 'Test', familyName: 'User', email: 'test@example.com' }));
  });

  it('set_default rejects missing org param', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'set_default' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('org parameter is required');
  });

  it('set_default rejects shell injection in org alias', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'set_default', org: 'bad;rm -rf /' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid org alias');
  });

  it('set_default rejects backtick injection', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'set_default', org: '`whoami`' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('set_default rejects pipe injection', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'set_default', org: 'x|cat /etc/passwd' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('set_default rejects dollar injection', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'set_default', org: '$(whoami)' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('set_default accepts valid aliases', async () => {
    const tool = createSfSetupTool(mockPi);
    for (const alias of ['my-org', 'prod.org', 'user@domain', 'org_123']) {
      const result = await tool.execute('t1', { action: 'set_default', org: alias }, undefined, undefined, {
        cwd: '/tmp',
      });
      // Will fail on exec (sf not mocked) but should NOT fail on validation
      if (result.isError) {
        expect(result.content[0].text).not.toContain('invalid org alias');
      }
    }
  });

  it('returns unknown action for unrecognized action', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'bogus' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.content[0].text).toContain('Unknown action: bogus');
  });
});
