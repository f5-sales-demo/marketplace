import { describe, expect, it } from 'bun:test';
import { GitHubLifecycle, type LifecycleCommand } from '../../src/tools/github-workflow';

function fixture(responses: Record<string, string> = {}) {
  const calls: LifecycleCommand[] = [];
  const lifecycle = new GitHubLifecycle(async (command) => {
    calls.push(command);
    return { exitCode: 0, stdout: responses[`${command.command} ${command.args.join(' ')}`] ?? '', stderr: '' };
  });
  return { calls, lifecycle };
}

describe('GitHub lifecycle stages', () => {
  it('runs every action independently and returns normalized evidence', async () => {
    for (const action of ['prepare', 'status', 'publish', 'monitor', 'repair', 'cleanup'] as const) {
      const { lifecycle } = fixture({
        'git rev-parse --show-toplevel': '/repo\n',
        'git remote get-url origin': 'https://github.com/acme/demo.git\n',
        'git rev-parse origin/main': '0123456789012345678901234567890123456789\n',
        'git symbolic-ref --short HEAD': 'feature/42-demo\n',
        'git worktree list --porcelain': '',
        'gh pr view 7 --repo acme/demo --json number,url,state,mergeStateStatus,headRefName,headRefOid,baseRefName':
          '{"number":7,"url":"https://github.com/acme/demo/pull/7","state":"MERGED","mergeStateStatus":"CLEAN","headRefName":"feature/42-demo","headRefOid":"abc","baseRefName":"main"}',
      });
      const input =
        action === 'prepare'
          ? { action, issueMode: 'none' as const, branch: 'feature/custom', worktree: '/tmp/demo-worktree' }
          : action === 'publish'
            ? { action, direct: true, autoMerge: false }
            : action === 'cleanup'
              ? { action, worktree: '/tmp/demo-worktree', branch: 'feature/42-demo', cleanupWithoutMergeProof: true }
              : { action, pr: '7' };
      const result = await lifecycle.run('/repo', input);
      expect(result.action).toBe(action);
      expect(result.repository.root).toBe('/repo');
      expect(result.operations.length).toBeGreaterThan(0);
      expect(Array.isArray(result.advisories)).toBe(true);
      if (action === 'cleanup') {
        expect(
          result.operations.some(
            (operation) =>
              operation.command === 'git' && operation.args.join(' ') === 'branch --delete --force feature/42-demo',
          ),
        ).toBe(true);
      }
    }
  });

  it('prepare stops after issue and worktree preparation without publishing', async () => {
    const { calls, lifecycle } = fixture({
      'git rev-parse --show-toplevel': '/repo\n',
      'git remote get-url origin': 'git@github.com:acme/demo.git\n',
      'git rev-parse origin/main': '0123456789012345678901234567890123456789\n',
      'git worktree list --porcelain': '',
      'gh issue create --repo acme/demo --title Lifecycle --body Body': 'https://github.com/acme/demo/issues/42\n',
    });
    const result = await lifecycle.run('/repo', {
      action: 'prepare',
      issueMode: 'create',
      issueTitle: 'Lifecycle',
      issueBody: 'Body',
      worktree: '/tmp/demo-worktree',
    });
    expect(result.issue?.number).toBe(42);
    expect(result.worktree?.path).toBe('/tmp/demo-worktree');
    expect(calls.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
    expect(calls.some((call) => call.command === 'gh' && call.args.slice(0, 2).join(' ') === 'pr create')).toBe(false);
  });

  it('reports governance deviations as advisories while executing requested operations', async () => {
    const { calls, lifecycle } = fixture({
      'git rev-parse --show-toplevel': '/repo\n',
      'git remote get-url origin': 'https://github.com/acme/demo.git\n',
      'git rev-parse origin/main': '0123456789012345678901234567890123456789\n',
      'git symbolic-ref --short HEAD': 'custom\n',
    });
    const result = await lifecycle.run('/repo', {
      action: 'publish',
      direct: true,
      stageAll: true,
      autoMerge: false,
    });
    expect(calls.some((call) => call.command === 'git' && call.args.join(' ') === 'add --all')).toBe(true);
    expect(calls.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(true);
    expect(result.advisories.map((item) => item.code)).toEqual(
      expect.arrayContaining(['github.direct_publication', 'github.stage_all', 'github.auto_merge_disabled']),
    );
  });

  it('keeps narrow issue and pull request operations independent', async () => {
    const { calls, lifecycle } = fixture({
      'git rev-parse --show-toplevel': '/repo\n',
      'git remote get-url origin': 'https://github.com/acme/demo.git\n',
      'git rev-parse origin/main': '0123456789012345678901234567890123456789\n',
      'git symbolic-ref --short HEAD': 'feature/42-demo\n',
      'gh issue create --repo acme/demo --title Lifecycle --body Body': 'https://github.com/acme/demo/issues/42\n',
      'gh pr create --repo acme/demo --base main --head feature/42-demo --title Change --body Details':
        'https://github.com/acme/demo/pull/7\n',
    });
    const issue = await lifecycle.createIssue('/repo', { issueTitle: 'Lifecycle', issueBody: 'Body' });
    expect(issue.issue?.number).toBe(42);
    expect(calls.some((call) => call.args[0] === 'worktree')).toBe(false);

    calls.length = 0;
    const pullRequest = await lifecycle.createPullRequest('/repo', { prTitle: 'Change', prBody: 'Details' });
    expect(pullRequest.pullRequest?.number).toBe(7);
    expect(calls.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
    expect(pullRequest.operations.find((operation) => operation.command === 'gh')?.args).toContain('[redacted]');
  });

  it('runs auto-merge and branch update as explicit argv operations', async () => {
    const prView =
      '{"number":7,"url":"https://github.com/acme/demo/pull/7","state":"OPEN","mergeStateStatus":"BEHIND","headRefName":"feature/42-demo","headRefOid":"abc","baseRefName":"main"}';
    const { calls, lifecycle } = fixture({
      'git rev-parse --show-toplevel': '/repo\n',
      'git remote get-url origin': 'https://github.com/acme/demo.git\n',
      'git rev-parse origin/main': '0123456789012345678901234567890123456789\n',
      'gh pr view 7 --repo acme/demo --json number,url,state,mergeStateStatus,headRefName,headRefOid,baseRefName':
        prView,
    });
    await lifecycle.enableAutoMerge('/repo', { pr: '7' });
    await lifecycle.updatePullRequestBranch('/repo', { pr: '7' });
    expect(calls.some((call) => call.args.join(' ') === 'pr merge 7 --repo acme/demo --auto --squash')).toBe(true);
    expect(calls.some((call) => call.args.join(' ') === 'pr update-branch 7 --repo acme/demo')).toBe(true);
  });
});
