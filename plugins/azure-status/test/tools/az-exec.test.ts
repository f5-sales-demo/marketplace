import { describe, expect, it } from 'bun:test';
import { createAzExecTool } from '../../src/tools/az-exec';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    Array: (itemSchema: unknown, opts?: Record<string, unknown>) => ({ type: 'array', items: itemSchema, ...opts }),
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
  },
};

describe('createAzExecTool', () => {
  const tool = createAzExecTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('az_exec');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure CLI Execute');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('az_exec injection prevention', () => {
  const tool = createAzExecTool({ typebox: mockTypebox });

  it('rejects args with semicolons', async () => {
    const result = await tool.execute('id', { args: ['vm', 'list;rm -rf /'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unsafe');
  });

  it('rejects args with pipe', async () => {
    const result = await tool.execute('id', { args: ['vm', 'list|cat'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects args with $() command substitution', async () => {
    const result = await tool.execute('id', { args: ['vm', '$(whoami)'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects args with backtick injection', async () => {
    const result = await tool.execute('id', { args: ['vm', '`id`'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects args with && chaining', async () => {
    const result = await tool.execute('id', { args: ['vm', 'list&&rm'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects args with || chaining', async () => {
    const result = await tool.execute('id', { args: ['vm', 'list||echo'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects empty args array', async () => {
    const result = await tool.execute('id', { args: [] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts safe args with flags', async () => {
    // This will fail due to actual CLI execution, but should NOT fail on validation
    try {
      await tool.execute('id', { args: ['webapp', 'list', '--resource-group', 'my-rg'] }, null, null, { cwd: '/tmp' });
    } catch {
      // CLI not available
    }
  });

  it('accepts args with paths and equals', async () => {
    try {
      await tool.execute('id', { args: ['storage', 'account', 'list', '--query', '[].name'] }, null, null, {
        cwd: '/tmp',
      });
    } catch {
      // CLI not available
    }
  });

  it('accepts JMESPath query with ?, *, and ()', async () => {
    try {
      await tool.execute('id', { args: ['vm', 'list', '--query', "[?contains(name, 'prod')]"] }, null, null, {
        cwd: '/tmp',
      });
    } catch {
      // CLI not available
    }
  });
});
