import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { visibleWidth } from '@f5-sales-demo/pi-tui';
import { presentation } from '@f5-sales-demo/xcsh';
import { Type } from '@sinclair/typebox';
import {
  aggregateQuery,
  aggregateRecord,
  eventSchema,
  queryHelp,
  taskQuery,
  taskRecords,
} from '../../plugins/salesforce/benchmarks/presentation-fixtures';
import {
  configurePersonProfile,
  configureSalesforceContext,
  configureSalesforceExecutor,
} from '../../plugins/salesforce/src/context/salesforce-context';
import factory from '../../plugins/salesforce/src/index';
import { copyableCommand } from '../../plugins/salesforce/src/presentation/command';
import { PluginViewComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/plugin-view';
import { ToolExecutionComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import { initTheme, setSymbolPreset, setTheme, theme } from './node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

const fixtureAccountId = '001000000000000';
const directory = mkdtempSync(join(tmpdir(), 'salesforce-workflow-'));
const executable = join(directory, 'sf');
const records = Array.from({ length: 12 }, (_, index) => ({
  attributes: { type: 'Opportunity' },
  Name: `Example Northern Assurance / F5 XC / ${index === 11 ? 'FINAL_OPPORTUNITY' : index}`,
  Account: { Name: 'Example Northern Assurance', Parent: { Name: 'Synthetic parent' } },
  Amount: index === 0 ? 0 : 123456.78 + index,
  CurrencyIsoCode: index % 2 ? 'USD' : 'CAD',
  StageName: 'Technical validation',
  CloseDate: '2027-03-31',
  LastModifiedDate: '2026-10-14',
  Owner: { Name: 'Synthetic owner' },
  IsClosed: false,
  IsWon: false,
  NextStep: index === 0 ? null : `Confirm product scope | 北方\nLine two ${index}`,
  Id: `006000000000${String(index).padStart(3, '0')}`,
}));
const schema = {
  name: 'Opportunity',
  fields: [
    { name: 'Id', label: 'Identifier', type: 'id', custom: false },
    ...Array.from({ length: 65 }, (_, i) => ({
      name: `SyntheticProduct${i}__c`,
      label: `Product ${i}`,
      type: 'picklist',
      custom: true,
      picklistValues: [
        { value: 'Distributed Cloud', active: true },
        { value: 'FINAL_PICKLIST_VALUE', active: true },
      ],
    })),
  ],
  childRelationships: [
    { childSObject: 'OpportunityLineItem', relationshipName: 'OpportunityLineItems', field: 'OpportunityId' },
  ],
};

// The real factory and host-resolved subprocess execute against an isolated synthetic CLI.
// This fixture never reads a real CLI, environment credential, or customer file.
writeFileSync(
  executable,
  `#!${process.execPath}\nconst args = process.argv.slice(2);\nconst q = args.findIndex(a => a === '--query' || a === '-q'); const query = q < 0 ? '' : args[q + 1];\nconst records = ${JSON.stringify(records)};\nconst schema = ${JSON.stringify(schema)};\nlet result;\nif (args.includes('--help')) { console.log(${JSON.stringify(queryHelp)}); process.exit(0); }\nif (args[0] === 'sobject') result = args.includes('Event') ? ${JSON.stringify(eventSchema)} : schema;\nelse if (args[0] === 'org') result = { username: 'synthetic@example.com', id: '00D000000000001', instanceUrl: 'https://salesforce.example.com', connectedStatus: 'Connected', alias: 'synthetic', accessToken: 'SYNTHETIC_SECRET_SENTINEL' };\nelse if (query.includes('DefinitelyMissingDemoField__c')) { console.log(JSON.stringify({status:1,name:'INVALID_FIELD',message: "No such column DefinitelyMissingDemoField__c on Opportunity"})); process.exit(1); }\nelse if (query.includes('FROM Period')) result = { records: [{ Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' }, { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' }], done: true, totalSize: 1 };\nelse if (query.includes('FROM Task')) result = {records:${JSON.stringify(taskRecords)},done:true,totalSize:10};\nelse if (query.includes('COUNT(') && query.includes('SUM(')) result = {records:[${JSON.stringify(aggregateRecord)}],done:true,totalSize:1};\nelse if (query.includes('COUNT(')) result = { records: [{ attributes: {type:'AggregateResult'}, total: 0 }], totalSize: 1, done: true };\nelse if (query.includes('FROM Account')) result = { records: query.includes('ambiguous') ? [{Id:'001000000000000',Name:'Example Northern Assurance Canada'},{Id:'001000000000002',Name:'Example Northern Assurance US'}] : [{Id:'001000000000000',Name:'Example Northern Assurance'}], totalSize: query.includes('ambiguous') ? 2 : 1, done:true };\nelse if (query.includes('SUM(')) result = { records:[{total:0}],totalSize:1,done:true };\nelse if (query.includes('FROM OpportunityLineItem') || query.includes('IsWon = true') || query.includes('Renewal')) result = { records:[],totalSize:0,done:true };\nelse result = { records: query.includes('Id = null') ? [] : records, totalSize: query.includes('Id = null') ? 0 : records.length, done: !query.includes('partial') };\nconsole.log(JSON.stringify({status:0,result}));\n`,
);
chmodSync(executable, 0o700);

type Tool = { name: string; execute: (...args: any[]) => Promise<any>; presentation: any };
const tools: Tool[] = [];
let integration: any;
beforeAll(async () => {
  await initTheme(false, 'unicode');
  await factory({
    presentation,
    typebox: { Type },
    host: { findExecutable: () => executable },
    software: { prepareSetup: async (_recipe: unknown, plan: unknown) => plan },
    personProfile: { get: async () => ({ facts: { identifiers: { salesforceId: '005000000000001' } } }) },
    integrations: {
      register: (definition: any) => {
        integration = definition;
        return {
          get: async () => ({
            state: 'ready',
            value: {
              userId: '005000000000001',
              username: 'synthetic@example.com',
              orgAlias: 'synthetic',
              instanceUrl: 'https://salesforce.example.com',
            },
          }),
        };
      },
    },
    exec: async () => ({ stdout: '', stderr: 'network unavailable', code: 1 }),
    registerTool: (tool: any) => tools.push(tool),
    setLabel() {},
    on(event: string, handler: any) {
      if (event === 'session_start')
        handler(
          {},
          {
            hasUI: true,
            ui: {
              get theme() {
                return theme;
              },
            },
          },
        );
    },
    logger: { debug() {} },
  } as never);
});
afterAll(() => {
  configurePersonProfile();
  configureSalesforceContext();
  configureSalesforceExecutor();
  rmSync(directory, { recursive: true, force: true });
});

async function invoke(name: string, args: unknown) {
  const tool = tools.find((tool) => tool.name === name)!;
  const result = await tool.execute('synthetic-workflow', args, undefined, undefined, { cwd: directory });
  return { tool, result, args };
}
function component(tool: Tool, result: any, args: unknown) {
  const view = new ToolExecutionComponent(
    tool.name,
    args,
    {},
    tool as never,
    { requestRender() {} } as never,
    directory,
  );
  view.updateResult(result);
  return view;
}
const plain = (lines: string[]) => Bun.stripANSI(lines.join('\n'));

test('all six production tools register; unavailable integration is not ready', async () => {
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    'sf_describe',
    'sf_exec',
    'sf_help',
    'sf_org_display',
    'sf_pipeline_report',
    'sf_query',
  ]);
  expect((await integration.probe()).state).toBe('unavailable');
});

test('project account lookup, ambiguity, opportunities and scope render through the real TUI', async () => {
  writeFileSync(
    join(directory, 'ACCOUNT_BRIEF.md'),
    '# Example Northern Assurance\nCanadian insurer. Investigate recent Distributed Cloud opportunities. Local dates are not Salesforce facts.',
  );
  const cases = [
    await invoke('sf_exec', { args: ['data', 'query', '-q', taskQuery, '-o', 'synthetic', '--json'] }),
    await invoke('sf_query', { query: taskQuery, target_org: 'synthetic' }),
    await invoke('sf_query', { query: aggregateQuery }),
    await invoke('sf_describe', { sobject: 'Event' }),
    await invoke('sf_query', {
      query: "SELECT Id, Name FROM Account WHERE Name LIKE '%ambiguous%'",
      description: 'Account candidates',
    }),
    await invoke('sf_query', {
      query: "SELECT Id, Name FROM Account WHERE Name = 'Example Northern Assurance'",
      description: 'Verified account',
    }),
    await invoke('sf_query', {
      query: `SELECT Name, Account.Name, Amount, CurrencyIsoCode, StageName, CloseDate, LastModifiedDate, Owner.Name, NextStep, IsClosed, IsWon, Id FROM Opportunity WHERE AccountId = '${fixtureAccountId}'`,
      description: 'Recent customer opportunities',
      target_org: 'synthetic',
    }),
    await invoke('sf_query', { query: 'SELECT Id FROM Opportunity WHERE Id = null', description: 'No opportunities' }),
    await invoke('sf_query', { query: 'SELECT COUNT(Id) total FROM Opportunity WHERE Id = null' }),
    await invoke('sf_query', { query: 'SELECT Id FROM Opportunity /* partial */' }),
    await invoke('sf_describe', { sobject: 'Opportunity' }),
    await invoke('sf_describe', { sobject: 'Opportunity', match: 'product' }),
    await invoke('sf_org_display', {}),
    await invoke('sf_help', { command_path: 'data query' }),
    await invoke('sf_exec', {
      args: ['data', 'query', '--query', 'SELECT COUNT(Id) total FROM Opportunity', '--json'],
    }),
    await invoke('sf_pipeline_report', {}),
    await invoke('sf_query', { query: 'SELECT DefinitelyMissingDemoField__c FROM Opportunity' }),
  ];
  for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
    await setSymbolPreset(preset);
    for (const theme of ['xcsh-dark', 'xcsh-light']) {
      expect((await setTheme(theme)).success).toBe(true);
      for (const { tool, result, args } of cases) {
        if (!String((args as { query?: string }).query ?? '').includes('DefinitelyMissingDemoField__c'))
          expect(result.isError).not.toBe(true);
        const view = component(tool, result, args);
        for (const width of [40, 76, 120, 153]) {
          const collapsedLines = view.render(width);
          expect(collapsedLines.every((line) => visibleWidth(line) <= width)).toBe(true);
          const collapsed = plain(collapsedLines);
          if (
            tool.name === 'sf_query' &&
            (args as any).query.includes('COUNT(') &&
            (args as any).query !== aggregateQuery
          )
            expect(collapsed.replace(/[\s│|]/g, '')).toContain('Opportunitycount');
          if (tool.name === 'sf_query' && (args as any).query.includes('partial'))
            expect(collapsed).toContain('Partial results');
          if (result.isError) expect(collapsed).toContain('No such column');
          if ((args as any).query === taskQuery || (args as any).args?.includes(taskQuery)) {
            expect(collapsed).toContain('7 more rows');
            expect(collapsed).not.toContain('Prepare demo 3');
            expect((collapsed.match(/SELECT/g) ?? []).length).toBe(1);
            expect(collapsed).toContain('--json');
          }
          if ((args as any).query === aggregateQuery) {
            expect(collapsed).toContain('1,234');
            expect(collapsed).toContain('9,876,543.2100');
            expect(collapsed).toContain('Currency unknown');
          }
          if ((args as any).sobject === 'Event') {
            expect(collapsed).toContain('Standard fields');
            expect(collapsed).toContain('17 custom fields omitted');
            expect(collapsed).toContain('Date/time');
            expect(collapsed).not.toContain('INACTIVE_EVIDENCE');
          }
          view.setExpanded(true);
          const lines = view.render(width);
          expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
          const expanded = plain(lines);
          expect((expanded.match(/Arguments/g) ?? []).length).toBe(1);
          if (!result.isError && (tool.name === 'sf_query' || tool.name === 'sf_exec'))
            expect((expanded.match(/sf data query/g) ?? []).length).toBe(1);
          if ((args as any).description === 'Recent customer opportunities') {
            expect(expanded).toContain('FINAL_OPPORTUNITY');
            expect(expanded).toContain('Synthetic parent');
            expect(expanded).toContain('null');
            expect(expanded).toContain('false');
            expect(expanded).not.toContain('[object Object]');
          }
          if ((args as any).query === taskQuery || (args as any).args?.includes(taskQuery))
            expect(expanded).toContain('Prepare demo 9');
          if (tool.name === 'sf_describe')
            expect(expanded).toContain(
              (args as any).sobject === 'Event' ? 'INACTIVE_EVIDENCE' : 'SyntheticProduct64__c',
            );
          if (tool.name === 'sf_org_display') expect(expanded).not.toContain('SYNTHETIC_SECRET_SENTINEL');
          if (tool.name === 'sf_pipeline_report')
            expect(expanded.replace(/[\s│|]/g, '')).toContain('FINAL_OPPORTUNITY');
          view.setExpanded(false);
        }
      }
    }
  }
}, 60_000);

test('schema error recovery and failed/empty renderers retain readable results', async () => {
  const failed = await invoke('sf_query', { query: 'SELECT DefinitelyMissingDemoField__c FROM Opportunity' });
  expect(failed.result.isError).toBe(true);
  expect(failed.result.content[0].text).toContain('sf_describe');
  const described = await invoke('sf_describe', { sobject: 'Opportunity', match: 'product' });
  expect(described.result.isError).not.toBe(true);
  for (const resultRenderer of [
    () => {
      throw new Error('synthetic renderer failure');
    },
    () => undefined,
  ]) {
    const tool = { ...failed.tool, presentation: { ...failed.tool.presentation, result: resultRenderer } };
    const view = component(tool, failed.result, failed.args);
    view.setExpanded(true);
    expect(plain(view.render(76))).toContain('No such column');
  }
});

// Exercise copied command text after the actual renderer has applied every supported layout.
test('copyable command survives terminal reflow and preserves exact arguments', async () => {
  // Bash is required on CI; exercise Zsh as well wherever it is installed.
  // Authenticated release acceptance separately requires both shells on Mac and Ubuntu.
  const bash = Bun.which('bash');
  expect(bash).not.toBeNull();
  const shells = [bash!, Bun.which('zsh')].filter((shell): shell is string => shell !== null);
  const argv = [
    'sf',
    'data',
    'query',
    '--query',
    "SELECT Subject FROM Task WHERE Subject = 'literal \\' quote $HOME 北方' LIMIT 10",
    '--target-org',
    'demo',
    '--json',
  ];
  const section = copyableCommand(presentation, argv);
  for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
    await setSymbolPreset(preset);
    for (const theme of ['xcsh-dark', 'xcsh-light']) {
      await setTheme(theme);
      for (const expanded of [false, true]) {
        for (const width of [40, 76, 120, 153]) {
          const component = new PluginViewComponent(() => ({ sections: [{ ...section, title: undefined }] }), expanded);
          const copied = plain(component.render(width - 10));
          for (const shell of shells) {
            const child = Bun.spawn([shell, '-f', '-c', `sf() { printf '%s\\0' "$@"; };\n${copied}`], {
              stdout: 'pipe',
              stderr: 'pipe',
            });
            const output = await new Response(child.stdout).text();
            expect(await child.exited).toBe(0);
            expect(output.split('\0').slice(0, -1)).toEqual(argv.slice(1));
          }
        }
      }
    }
  }
});

test('existing tool output follows live host theme and symbol switches', async () => {
  const { tool, result, args } = await invoke('sf_query', { query: 'SELECT Id FROM Opportunity /* partial */' });
  const view = component(tool, result, args);
  for (const preset of ['nerd', 'unicode', 'ascii'] as const) {
    await setSymbolPreset(preset);
    for (const name of ['xcsh-light', 'xcsh-dark']) {
      await setTheme(name);
      for (const expanded of [false, true]) {
        view.setExpanded(expanded);
        const presented = tool.presentation.result(result, { expanded, isPartial: false }, args);
        expect(presented.sections[0].title).toBeUndefined();
        expect(JSON.stringify(presented)).toContain(theme.symbol('status.warning'));
        expect(plain(view.render(76))).toContain('sf data query');
        expect(plain(view.render(76))).toContain(theme.symbol('status.warning'));
      }
    }
  }
});
