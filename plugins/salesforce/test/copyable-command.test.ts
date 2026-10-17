import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';
import { copyableCommand, toolArgv } from '../src/presentation/command';

const query = "SELECT Subject FROM Task WHERE Subject = 'literal \\' quote $HOME `echo wrong` 北方' LIMIT 10";
const cases = [
  ['sf_exec', { args: ['data:query', '--query', query, '--target-org', 'demo', '--json'] }],
  ['sf_query', { query, target_org: 'demo', all_rows: true, use_tooling_api: true }],
  ['sf_describe', { sobject: 'Event', target_org: 'demo', match: 'Subject' }],
  ['sf_org_display', { target_org: 'demo' }],
  ['sf_help', { command_path: 'data:query' }],
] as const;

test('generated command sections round trip exact argv through Bash and zsh without expansion', async () => {
  for (const argv of [
    ['sf', 'data', 'query', '--query', query, '--json'],
    ['sf', 'help', '', 'quotes\'\\"', 'a'.repeat(100), '北方'.repeat(30), 'line one\nline two'],
  ]) {
    const section = copyableCommand(presentation, argv);
    expect(section.kind).toBe('code');
    expect(
      section.text
        .split('\n')
        .every((line) => [...line].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0) <= 25),
    ).toBe(true);
    for (const shell of ['/bin/bash', ...(existsSync('/bin/zsh') ? ['/bin/zsh'] : [])]) {
      const proc = Bun.spawn([shell, '-f', '-c', `sf() { printf '%s\\0' "$@"; };\n${section.text}`], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = await new Response(proc.stdout).arrayBuffer();
      expect(await proc.exited).toBe(0);
      expect(new TextDecoder().decode(output).split('\0').slice(0, -1)).toEqual(argv.slice(1));
    }
  }
});
test('all direct tools show their complete executable command once in the default result', () => {
  for (const [name, args] of cases) {
    const argv = toolArgv(name, args);
    expect(argv?.[0]).toBe('sf');
    const result = presentTool({ name }, presentation).presentation.result(
      { content: [] },
      { expanded: false, isPartial: false },
      args,
    );
    expect(
      result.sections?.filter(
        (section) => section.kind === 'code' && section.text === copyableCommand(presentation, argv!).text,
      ),
    ).toHaveLength(1);
    expect(result.sections?.some((section) => section.kind === 'fields' && 'Command' in section.values)).toBe(false);
    expect(result.sections?.some((section) => ['SOQL', 'SOSL', 'Query'].includes(section.title ?? ''))).toBe(false);
  }
  expect(toolArgv('sf_query', cases[1][1])).toEqual([
    'sf',
    'data',
    'query',
    '--query',
    query,
    '--target-org',
    'demo',
    '--use-tooling-api',
    '--all-rows',
    '--json',
  ]);
  expect(toolArgv('sf_describe', cases[2][1])).toEqual([
    'sf',
    'sobject',
    'describe',
    '--sobject',
    'Event',
    '--target-org',
    'demo',
    '--json',
  ]);
  expect(toolArgv('sf_help', cases[4][1])).toEqual(['sf', 'data', 'query', '--help']);
});
