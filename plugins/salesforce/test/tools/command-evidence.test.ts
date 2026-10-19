import { afterEach, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import {
  configurePersonProfile,
  configureSalesforceContext,
  configureSalesforceExecutor,
} from '../../src/context/salesforce-context';
import { createSfDescribeTool } from '../../src/tools/sf-describe';
import { createSfExecTool } from '../../src/tools/sf-exec';
import { createSfHelpTool } from '../../src/tools/sf-help';
import { createSfOrgDisplayTool } from '../../src/tools/sf-org-display';
import { createSfPipelineReportTool } from '../../src/tools/sf-pipeline-report';
import { createSfQueryTool } from '../../src/tools/sf-query';
import { initTheme, plain, registered } from '../shared-runtime';

const pi = { typebox: { Type } };
const ctx = { cwd: '/tmp' };
const prefix = 'Executed Salesforce CLI argv (JSON):\n';
function evidence(result: { content: { text?: string }[] }) {
  const block = result.content.find((b) => b.text?.startsWith(prefix));
  expect(block).toBeDefined();
  if (!block?.text) throw new Error('Missing executed command evidence');
  return JSON.parse(block.text.slice(prefix.length));
}
afterEach(() => {
  configurePersonProfile();
  configureSalesforceContext();
  configureSalesforceExecutor();
});

const cases = [
  [
    createSfQueryTool,
    {
      query: 'SELECT Id FROM Account WHERE Name = \'Example "Account"\'',
      target_org: 'synthetic',
      all_rows: true,
      use_tooling_api: true,
    },
    { records: [], done: true },
    [
      'sf',
      'data',
      'query',
      '--query',
      'SELECT Id FROM Account WHERE Name = \'Example "Account"\'',
      '--target-org',
      'synthetic',
      '--use-tooling-api',
      '--all-rows',
      '--json',
    ],
  ],
  [
    createSfOrgDisplayTool,
    { target_org: 'synthetic' },
    { username: 'operator@example.com', instanceUrl: 'https://example.com', accessToken: 'synthetic-secret' },
    ['sf', 'org', 'display', '--target-org', 'synthetic', '--json'],
  ],
  [
    createSfDescribeTool,
    { sobject: 'Account', match: 'custom', target_org: 'synthetic' },
    { name: 'Account', fields: [] },
    ['sf', 'sobject', 'describe', '--sobject', 'Account', '--target-org', 'synthetic', '--json'],
  ],
  [createSfHelpTool, { command_path: 'org:display' }, undefined, ['sf', 'org', 'display', '--help']],
  [createSfExecTool, { args: ['version'] }, undefined, ['sf', 'version']],
] as const;
for (const [factory, params, payload, expected] of cases) {
  for (const failed of [false, true])
    it(`${factory.name} exposes actual argv on ${failed ? 'failure' : 'success'}`, async () => {
      const calls: string[][] = [];
      const tool = factory(pi, () => ({
        exec: async (command: string, args: string[]) => {
          calls.push([command, ...args]);
          return {
            stdout: payload
              ? JSON.stringify({ status: failed ? 1 : 0, result: payload, message: 'Synthetic failure' })
              : failed
                ? ''
                : 'USAGE\nSynthetic output',
            stderr: failed ? 'Synthetic failure' : '',
            exitCode: failed ? 1 : 0,
          };
        },
      }));
      const result = await tool.execute('case', params as never, undefined, undefined, ctx);
      expect(calls).toEqual([Array.from(expected)]);
      expect(evidence(result)).toEqual({ commands: calls, withheld: 0 });
      expect(result.isError === true).toBe(failed);
      expect(JSON.stringify(result)).not.toContain('synthetic-secret');
    });
}
it('reports no command for rejected validation', async () => {
  const tool = createSfQueryTool(pi, () => ({
    exec: async () => {
      throw new Error('must not execute');
    },
  }));
  expect(evidence(await tool.execute('invalid', { query: '' }, undefined, undefined, ctx))).toEqual({
    commands: [],
    withheld: 0,
  });
});
it('does not expose sensitive passthrough argv as exact evidence', async () => {
  const tool = createSfExecTool(pi, () => ({ exec: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }) }));
  const result = await tool.execute(
    'secret',
    { args: ['org', 'display', '--access-token=synthetic-secret'] },
    undefined,
    undefined,
    ctx,
  );
  expect(evidence(result)).toEqual({ commands: [], withheld: 1 });
  expect(JSON.stringify(result)).not.toContain('synthetic-secret');
});
it('records only attempted pipeline commands, including failed discovery', async () => {
  configurePersonProfile(async () => ({}));
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'original' }) as never);
  const calls: string[][] = [];
  const tool = createSfPipelineReportTool(pi, () => ({
    exec: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: JSON.stringify({ status: 1, message: 'Synthetic discovery failure' }), stderr: '', exitCode: 1 };
    },
  }));
  const result = await tool.execute('pipeline', { target_org: 'different' }, undefined, undefined, ctx);
  expect(result.isError).toBe(true);
  expect(evidence(result)).toEqual({ commands: calls, withheld: 0 });
  expect(calls).toEqual([['sf', 'org', 'display', '--target-org', 'different', '--json']]);
});
it('records all actual pipeline queries on success without inventing commands', async () => {
  configurePersonProfile(async () => ({}));
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'synthetic' }) as never);
  const calls: string[][] = [];
  const tool = createSfPipelineReportTool(pi, () => ({
    exec: async (command, args) => {
      calls.push([command, ...args]);
      const calendar = args.join(' ').includes('FROM Period');
      return {
        stdout: JSON.stringify({
          status: 0,
          result: {
            done: true,
            records: calendar
              ? [
                  { Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' },
                  { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' },
                ]
              : [],
          },
        }),
        stderr: '',
        exitCode: 0,
      };
    },
  }));
  const result = await tool.execute('pipeline', {}, undefined, undefined, ctx);
  expect(result.isError).not.toBe(true);
  expect(calls.length).toBeGreaterThan(1);
  expect(evidence(result)).toEqual({ commands: calls, withheld: 0 });
});

it('isolates concurrent tool invocations and snapshots completed evidence', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tool = createSfQueryTool(pi, () => ({
    exec: async (_command, args) => {
      if (args.includes('SELECT Id FROM Account')) await held;
      return { stdout: JSON.stringify({ status: 0, result: { records: [], done: true } }), stderr: '', exitCode: 0 };
    },
  }));
  const first = tool.execute('first', { query: 'SELECT Id FROM Account' }, undefined, undefined, ctx);
  const second = await tool.execute('second', { query: 'SELECT Id FROM Contact' }, undefined, undefined, ctx);
  expect(evidence(second).commands).toEqual([['sf', 'data', 'query', '--query', 'SELECT Id FROM Contact', '--json']]);
  release();
  expect(evidence(await first).commands).toEqual([
    ['sf', 'data', 'query', '--query', 'SELECT Id FROM Account', '--json'],
  ]);
});
it('retains cancellation semantics', async () => {
  const abort = new DOMException('Cancelled', 'AbortError');
  const tool = createSfQueryTool(pi, () => ({
    exec: async () => {
      throw abort;
    },
  }));
  await expect(tool.execute('abort', { query: 'SELECT Id FROM Account' }, undefined, undefined, ctx)).rejects.toBe(
    abort,
  );
});
it('captures injected context discovery commands in the same pipeline call', async () => {
  configurePersonProfile(async () => ({}));
  configureSalesforceContext(
    async () => ({ userId: '005000000000001', orgAlias: 'synthetic', discoveryPending: true }) as never,
  );
  const discovery: string[][] = [];
  configureSalesforceExecutor(async (args) => {
    discovery.push(['sf', ...args]);
    return {
      stdout: JSON.stringify({ status: 1, message: 'Synthetic unavailable discovery' }),
      stderr: '',
      exitCode: 1,
    };
  });
  const queries: string[][] = [];
  const tool = createSfPipelineReportTool(pi, () => ({
    exec: async (command, args) => {
      queries.push([command, ...args]);
      return { stdout: JSON.stringify({ status: 1, message: 'Synthetic failed calendar' }), stderr: '', exitCode: 1 };
    },
  }));
  const result = await tool.execute('discover', {}, undefined, undefined, ctx);
  expect(discovery.length).toBeGreaterThan(0);
  expect(evidence(result).commands).toEqual([...discovery, ...queries]);
});
it('shared rendering keeps model evidence out of duplicated human output', async () => {
  initTheme();
  const tool = createSfQueryTool(pi, () => ({
    exec: async () => ({
      stdout: JSON.stringify({ status: 0, result: { records: [{ Name: 'Synthetic account' }], done: true } }),
      stderr: '',
      exitCode: 0,
    }),
  }));
  const args = { query: 'SELECT Name FROM Account' };
  const result = await tool.execute('render', args, undefined, undefined, ctx);
  expect(evidence(result).commands).toHaveLength(1);
  const component = await registered('sf_query', args);
  component.updateResult(result);
  for (const expanded of [false, true]) {
    component.setExpanded(expanded);
    const rendered = plain(component.render(76));
    expect(rendered).toContain('Synthetic account');
    expect(rendered).not.toContain('Executed Salesforce CLI argv');
    expect(rendered).not.toContain('commandEvidence');
    expect(rendered).not.toContain('withheld');
  }
});
