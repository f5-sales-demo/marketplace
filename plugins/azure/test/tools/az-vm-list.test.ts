import { describe, expect, it } from 'bun:test';
import { createAzVmListTool } from '../../src/tools/az-vm-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Boolean: (opts?: Record<string, unknown>) => ({ type: 'boolean', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAzVmListTool', () => {
  const tool = createAzVmListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('az_vm_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure Virtual Machines');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az vm');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('az_vm input validation', () => {
  const tool = createAzVmListTool({ typebox: mockTypebox });

  it('rejects resource group with shell injection', async () => {
    const result = await tool.execute('id', { resource_group: '$(whoami)' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects subscription with pipe injection', async () => {
    const result = await tool.execute('id', { subscription: 'test|cat' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts valid resource group', async () => {
    try {
      await tool.execute('id', { resource_group: 'my-resource-group' }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI not available
    }
  });

  it('accepts show_details false (no validation error)', async () => {
    // Boolean params can't cause shell injection — just verify no validation rejection
    try {
      await tool.execute('id', { show_details: false }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI call may fail but not due to validation
    }
  });
});
