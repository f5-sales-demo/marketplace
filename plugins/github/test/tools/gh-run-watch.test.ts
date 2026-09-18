import { describe, expect, it, spyOn } from 'bun:test';
import { GhRunWatchTool } from '../../src/tools/gh';
import * as git from '../../src/utils/git';

describe('gh_run_watch request sharing', () => {
  it('shares one terminal run request and one jobs request across concurrent callers', async () => {
    let releaseFirstRequest: (() => void) | undefined;
    const firstRequestStarted = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    let calls = 0;
    const json = spyOn(git.github, 'json').mockImplementation(async (_cwd, args) => {
      calls += 1;
      if (args.at(-1)?.endsWith('/actions/runs/123')) {
        expect(args).toContain('--cache');
        await firstRequestStarted;
        return {
          id: 123,
          status: 'completed',
          conclusion: 'success',
          name: 'CI',
          html_url: 'https://github.com/acme/widgets/actions/runs/123',
        };
      }
      return { total_count: 0, jobs: [] };
    });

    const tool = new GhRunWatchTool({ cwd: '/tmp' });
    const first = tool.execute('first', { run: 'https://github.com/acme/widgets/actions/runs/123' });
    const second = tool.execute('second', { run: 'https://github.com/acme/widgets/actions/runs/123' });
    await Promise.resolve();
    releaseFirstRequest?.();

    try {
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toEqual(secondResult);
      expect(calls).toBe(2);
      expect(json).toHaveBeenCalledTimes(2);
    } finally {
      json.mockRestore();
    }
  });
});
