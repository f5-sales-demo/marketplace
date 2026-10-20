import { describe, expect, it } from 'bun:test';
import { createAzHelpTool } from '../../src/tools/az-help';

// Validation tests must never reach a real CLI: whether one is installed, and how long it
// takes to answer, is not part of what they are asserting.
const stubExec = () => ({
  exec: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }),
});

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAzHelpTool', () => {
  const tool = createAzHelpTool({ typebox: mockTypebox }, stubExec);

  it('has correct name', () => {
    expect(tool.name).toBe('az_help');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure CLI Help');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('help');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('az_help input validation', () => {
  const tool = createAzHelpTool({ typebox: mockTypebox }, stubExec);

  it('rejects command_path with semicolons', async () => {
    const result = await tool.execute('id', { command_path: 'vm;rm' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects command_path with shell injection', async () => {
    const result = await tool.execute('id', { command_path: '$(whoami)' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects command_path with uppercase', async () => {
    const result = await tool.execute('id', { command_path: 'VM' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts valid single-word path', async () => {
    // This will call the actual CLI — just verifying no validation error
    const result = await tool.execute('id', { command_path: 'vm' }, null, null, { cwd: '/tmp' });
    // If az is installed, should succeed; if not, should return exec error (not validation error)
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid command path');
    }
  });

  it('accepts valid multi-word path', async () => {
    const result = await tool.execute('id', { command_path: 'network vnet' }, null, null, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid command path');
    }
  });

  it('accepts empty command_path for top-level help', async () => {
    const result = await tool.execute('id', { command_path: '' }, null, null, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid command path');
    }
  });
});

it('rejects option tokens embedded in a help command path without executing', async () => {
  let executions = 0;
  const tool = createAzHelpTool({ typebox: mockTypebox }, () => ({
    exec: async () => {
      executions++;
      return { stdout: 'Group', stderr: '', exitCode: 0 };
    },
  }));
  const result = await tool.execute('synthetic', { command_path: 'vm --debug' }, undefined, undefined, {
    cwd: '/synthetic',
  });
  expect(result.isError).toBe(true);
  expect(executions).toBe(0);
});
it('forwards cancellation to help execution', async () => {
  const controller = new AbortController();
  let observed: AbortSignal | undefined;
  const tool = createAzHelpTool({ typebox: mockTypebox }, () => ({
    exec: async (_command, _args, options) => {
      observed = options?.signal;
      return { stdout: 'Group', stderr: '', exitCode: 0 };
    },
  }));
  await tool.execute('synthetic', {}, controller.signal, undefined, { cwd: '/synthetic' });
  expect(observed).toBe(controller.signal);
});
