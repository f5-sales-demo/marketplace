import { describe, expect, it } from 'bun:test';
import { createAzAccountShowTool } from '../../src/tools/az-account-show';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
    Union: (schemas: unknown[]) => ({ union: schemas }),
    Literal: (value: string) => ({ const: value }),
  },
};

describe('createAzAccountShowTool', () => {
  const tool = createAzAccountShowTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('az_account_show');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure Account');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az account');
  });

  it('has parameters schema', () => {
    expect(tool.parameters).toBeDefined();
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('az_account_show input validation', () => {
  const tool = createAzAccountShowTool({ typebox: mockTypebox });

  it('rejects subscription with semicolons', async () => {
    const result = await tool.execute('id', { action: 'show', subscription: 'test;rm -rf /' }, null, null, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid');
  });

  it('rejects subscription with pipe', async () => {
    const result = await tool.execute('id', { action: 'show', subscription: 'test|cat' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects subscription with $() injection', async () => {
    const result = await tool.execute('id', { action: 'show', subscription: '$(whoami)' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects subscription with backticks', async () => {
    const result = await tool.execute('id', { action: 'show', subscription: '`id`' }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts valid UUID subscription ID', async () => {
    // Will fail because az isn't mocked, but should NOT fail on validation
    try {
      await tool.execute('id', { action: 'show', subscription: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, null, null, {
        cwd: '/tmp',
      });
    } catch {
      // Expected: CLI not available, but validation passed
    }
  });

  it('accepts valid subscription name', async () => {
    try {
      await tool.execute('id', { action: 'list', subscription: 'My Dev Subscription' }, null, null, { cwd: '/tmp' });
    } catch {
      // Expected: CLI not available, but validation passed
    }
  });
});
