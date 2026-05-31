import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createSfQueryTool } from '../../src/tools/sf-query';

const mockPi = { typebox: { Type }, logger: { debug() {} } };

describe('createSfQueryTool', () => {
  it('returns a tool definition with correct name', () => {
    const tool = createSfQueryTool(mockPi);
    expect(tool.name).toBe('sf_query');
    expect(tool.label).toBe('Salesforce Query');
    expect(tool.description).toBeTruthy();
  });

  it('has description loaded from prompt template', () => {
    const tool = createSfQueryTool(mockPi);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(50);
  });
});

describe('sf_query execute — validation', () => {
  it('rejects shell injection in org alias', async () => {
    const tool = createSfQueryTool(mockPi);
    const result = await tool.execute(
      't1',
      { query: 'SELECT Id FROM Account', target_org: 'bad;whoami' },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid org alias');
  });

  it('rejects backtick injection in org alias', async () => {
    const tool = createSfQueryTool(mockPi);
    const result = await tool.execute(
      't1',
      { query: 'SELECT Id FROM Account', target_org: '`id`' },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );
    expect(result.isError).toBe(true);
  });

  it('rejects dollar sign injection', async () => {
    const tool = createSfQueryTool(mockPi);
    const result = await tool.execute(
      't1',
      { query: 'SELECT Id FROM Account', target_org: '$(whoami)' },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );
    expect(result.isError).toBe(true);
  });

  it('accepts valid org alias without error on validation', async () => {
    const tool = createSfQueryTool(mockPi);
    const result = await tool.execute(
      't1',
      { query: 'SELECT Id FROM Account', target_org: 'valid-org.123' },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );
    // May fail on exec (sf not available), but NOT on alias validation
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });

  it('does not reject when target_org is omitted', () => {
    // Verify the tool definition itself doesn't require target_org
    const tool = createSfQueryTool(mockPi);
    expect(tool.parameters).toBeTruthy();
    // target_org is optional — the tool should accept calls without it
    // (actual exec behavior tested in integration tests)
  });
});
