import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { GhPrCheckoutTool, GhPrPushTool } from '../../src/tools/gh';
import * as git from '../../src/utils/git';

afterEach(() => mock.restore());

describe('headless GitHub mutations', () => {
  it('lets checkout reach repository discovery without an environment opt-in', async () => {
    const view = spyOn(git.github, 'json').mockRejectedValue(new Error('synthetic command failure'));
    delete process.env.GITHUB_ALLOW_MUTATIONS;
    await expect(
      new GhPrCheckoutTool({ cwd: '/tmp' } as never).execute('id', { pr: '1' }, undefined, undefined, {
        cwd: '/tmp',
        hasUI: false,
      } as never),
    ).rejects.toThrow('synthetic command failure');
    expect(view).toHaveBeenCalled();
  });

  it('lets push reach git discovery without an environment opt-in', async () => {
    const root = spyOn(git.repo, 'root').mockResolvedValue(null);
    delete process.env.GITHUB_ALLOW_MUTATIONS;
    await expect(
      new GhPrPushTool({ cwd: '/tmp' } as never).execute('id', {}, undefined, undefined, {
        cwd: '/tmp',
        hasUI: false,
      } as never),
    ).rejects.toThrow(/repository/i);
    expect(root).toHaveBeenCalled();
  });
});
