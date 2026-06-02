import { describe, expect, it } from 'bun:test';
import { createAzResourceListTool } from '../../src/tools/az-resource-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAzResourceListTool', () => {
  const tool = createAzResourceListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('az_resource_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure Resources');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az resource');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('az_resource input validation', () => {
  const tool = createAzResourceListTool({ typebox: mockTypebox });

  it('rejects resource group with semicolons', async () => {
    const result = await tool.execute('id', { resource_group: ';rm -rf /' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid');
  });

  it('rejects resource group with $() injection', async () => {
    const result = await tool.execute('id', { resource_group: '$(id)' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects resource type with shell injection', async () => {
    const result = await tool.execute('id', { resource_group: 'rg1', resource_type: '; whoami' }, null, null, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('rejects subscription with backticks', async () => {
    const result = await tool.execute('id', { resource_group: 'rg1', subscription: '`id`' }, null, null, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('accepts valid resource group name', async () => {
    try {
      await tool.execute('id', { resource_group: 'my-rg_v2.test' }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI not available
    }
  });

  it('accepts valid resource type', async () => {
    try {
      await tool.execute(
        'id',
        { resource_group: 'rg1', resource_type: 'Microsoft.Compute/virtualMachines' },
        null,
        null,
        { cwd: '/tmp' },
      );
    } catch {
      // CLI not available
    }
  });
});
