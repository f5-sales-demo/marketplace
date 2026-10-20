import { expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabHelpTool } from '../../src/tools/glab-help';
import { createGlabIssueListTool } from '../../src/tools/glab-issue-list';
import { createGlabSearchTool } from '../../src/tools/glab-search';

const pi = { typebox: { Type } };
const ctx = { cwd: '/synthetic-no-config' };
const response = (stdout: string, code = 0, stderr = '') => ({ stdout, code, stderr, killed: false });
test('unavailable project and auth produce errors, not empty successful results', async () => {
  const missing = createGlabIssueListTool(
    pi,
    (cwd) => ({ cwd, exec: async () => response('', 1) }),
    async () => null,
  );
  expect((await missing.execute('fixture', {}, undefined, undefined, ctx)).isError).toBe(true);
  const auth = createGlabIssueListTool(pi, (cwd) => ({ cwd, exec: async () => response('', 1, 'not logged in') }));
  expect((await auth.execute('fixture', { project: 'synthetic/repo' }, undefined, undefined, ctx)).isError).toBe(true);
});
test('failed search sources cannot fabricate a verified zero', async () => {
  const tool = createGlabSearchTool(pi, (cwd) => ({ cwd, exec: async () => response('', 1, 'network unavailable') }));
  expect(
    (await tool.execute('fixture', { project: 'synthetic/repo', query: 'synthetic' }, undefined, undefined, ctx))
      .isError,
  ).toBe(true);
});
test('REST evidence survives unavailable GraphQL with explicit partial scope', async () => {
  const tool = createGlabSearchTool(pi, (cwd) => ({
    cwd,
    exec: async (_cmd, args) => (args[0] === 'issue' ? response('[]') : response('', 1, 'network unavailable')),
  }));
  const result = await tool.execute(
    'fixture',
    { project: 'synthetic/repo', query: 'synthetic' },
    undefined,
    undefined,
    ctx,
  );
  expect(result.details?.partial).toBe(true);
  expect(result.details?.warnings?.join(' ')).toContain('GraphQL');
  expect(result.details?.total).toBe(0);
});

test('help authentication failure remains an error with setup guidance', async () => {
  const tool = createGlabHelpTool(pi, (cwd) => ({ cwd, exec: async () => response('', 1, 'not logged in') }));
  const result = await tool.execute('synthetic-help', {}, undefined, undefined, ctx);
  expect(result.isError).toBe(true);
  expect(result.details?.errorType).toBe('auth_required');
});
