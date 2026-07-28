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

  it('set_default accepts valid aliases and asks sf to set each one', async () => {
    // This used to run the real `sf` binary. On a machine with the CLI installed that meant
    // four genuine `sf config set target-org <alias> --global` writes to ~/.sf/config.json
    // — a unit test mutating the developer's own Salesforce config — and it blew the 5 s
    // timeout. Injecting the executor keeps the assertion (validation lets these through)
    // and removes the side effect.
    const calls: string[][] = [];
    const tool = createSfSetupTool(mockPi, () => ({
      async exec(_command: string, args: string[]) {
        calls.push(args);
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    }));

    for (const alias of ['my-org', 'prod.org', 'user@domain', 'org_123']) {
      const result = await tool.execute('t1', { action: 'set_default', org: alias }, undefined, undefined, {
        cwd: '/tmp',
      });
      expect(result.isError).toBeFalsy();
    }

    expect(calls).toEqual([
      ['config', 'set', 'target-org', 'my-org', '--global'],
      ['config', 'set', 'target-org', 'prod.org', '--global'],
      ['config', 'set', 'target-org', 'user@domain', '--global'],
      ['config', 'set', 'target-org', 'org_123', '--global'],
    ]);
  });

  it('rejects an invalid alias before running anything', async () => {
    const calls: string[][] = [];
    const tool = createSfSetupTool(mockPi, () => ({
      async exec(_command: string, args: string[]) {
        calls.push(args);
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    }));

    const result = await tool.execute('t1', { action: 'set_default', org: 'x;rm -rf /' }, undefined, undefined, {
      cwd: '/tmp',
    });

    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('returns unknown action for unrecognized action', async () => {
    const tool = createSfSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'bogus' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.content[0].text).toContain('Unknown action: bogus');
  });
});
