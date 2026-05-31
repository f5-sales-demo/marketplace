import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createSfOrgDisplayTool } from '../../src/tools/sf-org-display';

const mockPi = { typebox: { Type }, logger: { debug() {} } };

describe('createSfOrgDisplayTool', () => {
  it('returns a tool definition with correct name', () => {
    const tool = createSfOrgDisplayTool(mockPi);
    expect(tool.name).toBe('sf_org_display');
    expect(tool.label).toBe('Salesforce Org Display');
  });

  it('has description loaded from prompt template', () => {
    const tool = createSfOrgDisplayTool(mockPi);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(10);
  });
});

describe('sf_org_display execute — validation', () => {
  it('rejects shell injection in org alias', async () => {
    const tool = createSfOrgDisplayTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'bad$(id)' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid org alias');
  });

  it('rejects semicolon injection', async () => {
    const tool = createSfOrgDisplayTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'org;rm -rf /' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects pipe injection', async () => {
    const tool = createSfOrgDisplayTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'org|cat /etc/passwd' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('accepts valid org alias without validation error', async () => {
    const tool = createSfOrgDisplayTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'prod-org' }, undefined, undefined, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });

  it('proceeds without target_org', async () => {
    const tool = createSfOrgDisplayTool(mockPi);
    const result = await tool.execute('t1', {}, undefined, undefined, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });
});
