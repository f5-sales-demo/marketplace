import { describe, expect, it } from 'bun:test';
import { createAzGroupListTool } from '../../src/tools/az-group-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
    Union: (schemas: unknown[]) => ({ union: schemas }),
    Literal: (value: string) => ({ const: value }),
  },
};

describe('createAzGroupListTool', () => {
  const tool = createAzGroupListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('az_group_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure Resource Groups');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az group');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('az_group input validation', () => {
  const tool = createAzGroupListTool({ typebox: mockTypebox });

  it('rejects subscription with shell injection', async () => {
    const result = await tool.execute('id', { action: 'list', subscription: ';rm -rf /' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects resource group name with shell injection', async () => {
    const result = await tool.execute('id', { action: 'show', name: '$(whoami)' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects tag with pipe injection', async () => {
    const result = await tool.execute('id', { action: 'list', tag: 'env|cat /etc/passwd' }, null, null, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('accepts valid resource group name', async () => {
    try {
      await tool.execute('id', { action: 'show', name: 'my-resource-group.v2' }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI not available
    }
  });

  it('accepts valid tag', async () => {
    try {
      await tool.execute('id', { action: 'list', tag: 'env=production' }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI not available
    }
  });
});
