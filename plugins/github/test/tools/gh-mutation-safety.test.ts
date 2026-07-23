import { afterEach, describe, expect, it } from 'bun:test';
import { GhPrCheckoutTool, GhPrPushTool } from '../../src/tools/gh';
import { HEADLESS_BLOCKED_MESSAGE } from '../../src/tools/mutation-safety';

const origEnv = process.env.GITHUB_ALLOW_MUTATIONS;
afterEach(() => {
  if (origEnv === undefined) delete process.env.GITHUB_ALLOW_MUTATIONS;
  else process.env.GITHUB_ALLOW_MUTATIONS = origEnv;
});

describe('gh_pr_push mutation gate', () => {
  it('refuses in headless mode without opt-in, before touching git', async () => {
    delete process.env.GITHUB_ALLOW_MUTATIONS;
    // cwd is os tmp (not a repo); the guard must fire before any git call.
    const tool = new GhPrPushTool({ cwd: '/tmp' } as never);
    await expect(tool.execute('id', {}, undefined, undefined, { cwd: '/tmp', hasUI: false } as never)).rejects.toThrow(
      HEADLESS_BLOCKED_MESSAGE,
    );
  });
});

describe('gh_pr_checkout mutation gate', () => {
  it('refuses in headless mode without opt-in, before touching gh/git', async () => {
    delete process.env.GITHUB_ALLOW_MUTATIONS;
    const tool = new GhPrCheckoutTool({ cwd: '/tmp' } as never);
    await expect(
      tool.execute('id', { pr: '1' }, undefined, undefined, { cwd: '/tmp', hasUI: false } as never),
    ).rejects.toThrow(HEADLESS_BLOCKED_MESSAGE);
  });
});
