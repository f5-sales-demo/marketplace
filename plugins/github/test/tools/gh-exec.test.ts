import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { GhExecTool } from '../../src/tools/gh';
import * as git from '../../src/utils/git';
import { hasControlChars } from '../../src/utils/git';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe('hasControlChars', () => {
  it('rejects NUL/control bytes but allows tab (multi-line --jq) and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars("pr list --jq '.[].title'")).toBe(false);
  });
});

describe('gh_exec execute', () => {
  const tool = new GhExecTool({ cwd: '/tmp' } as never);

  afterEach(() => {
    mock.restore();
  });

  it('rejects empty args', async () => {
    const r = await tool.execute('id', { args: [] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
  });
  it('rejects control chars', async () => {
    const r = await tool.execute('id', { args: [`pr${NUL}list`] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('control character');
  });
  it('passes mutating commands through as validated argv', async () => {
    const run = spyOn(git.github, 'run').mockResolvedValue({ stdout: 'merged', stderr: '', exitCode: 0 });
    const r = await tool.execute('id', { args: ['pr', 'merge', '1'] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).not.toBe(true);
    expect(r.content[0].text).toBe('merged');
    expect(run).toHaveBeenCalledWith('/tmp', ['pr', 'merge', '1'], undefined);
  });

  it('returns stderr when a successful command produces no stdout', async () => {
    spyOn(git.github, 'run').mockResolvedValue({
      stdout: '',
      stderr: 'Logged in to github.com',
      exitCode: 0,
    });

    const result = await tool.execute('id', { args: ['auth', 'status'] }, undefined, undefined, {
      cwd: '/tmp',
    } as never);

    expect(result.content).toEqual([{ type: 'text', text: 'Logged in to github.com' }]);
  });

  it('prefers stdout when a successful command also produces stderr', async () => {
    spyOn(git.github, 'run').mockResolvedValue({
      stdout: 'repository output',
      stderr: 'incidental warning',
      exitCode: 0,
    });

    const result = await tool.execute('id', { args: ['repo', 'view'] }, undefined, undefined, { cwd: '/tmp' } as never);

    expect(result.content).toEqual([{ type: 'text', text: 'repository output' }]);
  });

  it('truncates successful stderr fallback output at the normal limit', async () => {
    spyOn(git.github, 'run').mockResolvedValue({
      stdout: '',
      stderr: 'x'.repeat(50_001),
      exitCode: 0,
    });

    const result = await tool.execute('id', { args: ['auth', 'status'] }, undefined, undefined, {
      cwd: '/tmp',
    } as never);
    const output = result.content[0].text;

    expect(output.startsWith('x'.repeat(50_000))).toBe(true);
    expect(output.endsWith('[Output truncated]')).toBe(true);
  });
});
