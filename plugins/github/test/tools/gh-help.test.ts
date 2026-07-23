import { describe, expect, it } from 'bun:test';
import { GhHelpTool } from '../../src/tools/gh';

describe('gh_help', () => {
  const tool = new GhHelpTool({ cwd: '/tmp' } as never);
  it('rejects an invalid command path before spawning', async () => {
    const res = await tool.execute('id', { command_path: 'pr; rm -rf /' }, undefined, undefined, {
      cwd: '/tmp',
    } as never);
    expect(res.isError).toBe(true);
    expect(res.content[0].text.toLowerCase()).toContain('invalid command path');
  });

  it('rejects a command path part that starts with a dash (flag smuggling)', async () => {
    const res = await tool.execute('id', { command_path: 'pr -x' }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('must not start with');
  });
});
