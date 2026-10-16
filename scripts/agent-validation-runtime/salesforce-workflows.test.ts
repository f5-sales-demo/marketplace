import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { visibleWidth } from '@f5-sales-demo/pi-tui';
import { presentation } from '@f5-sales-demo/xcsh';
import { Type } from '@sinclair/typebox';
import {
  configurePersonProfile,
  configureSalesforceContext,
  configureSalesforceExecutor,
} from '../../plugins/salesforce/src/context/salesforce-context';
import factory from '../../plugins/salesforce/src/index';
import { ToolExecutionComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import { initTheme, setSymbolPreset, setTheme } from './node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

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
  `#!${process.execPath}\nconst args = process.argv.slice(2);\nconst query = args[args.indexOf('--query') + 1] ?? '';\nconst records = ${JSON.stringify(records)};\nconst schema = ${JSON.stringify(schema)};\nlet result;\nif (args.includes('--help')) { console.log('Synthetic Salesforce CLI help: sf data query --query SOQL'); process.exit(0); }\nif (args[0] === 'sobject') result = schema;\nelse if (args[0] === 'org') result = { username: 'synthetic@example.com', id: '00D000000000001', instanceUrl: 'https://salesforce.example.com', connectedStatus: 'Connected', alias: 'synthetic', accessToken: 'SYNTHETIC_SECRET_SENTINEL' };\nelse if (query.includes('DefinitelyMissingDemoField__c')) { console.log(JSON.stringify({status:1,name:'INVALID_FIELD',message: "No such column DefinitelyMissingDemoField__c on Opportunity"})); process.exit(1); }\nelse if (query.includes('FROM Period')) result = { records: [{ Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' }, { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' }], done: true, totalSize: 1 };\nelse if (query.includes('COUNT(')) result = { records: [{ attributes: {type:'AggregateResult'}, total: 0 }], totalSize: 1, done: true };\nelse if (query.includes('FROM Account')) result = { records: query.includes('ambiguous') ? [{Id:'001000000000000',Name:'Example Northern Assurance Canada'},{Id:'001000000000002',Name:'Example Northern Assurance US'}] : [{Id:'001000000000000',Name:'Example Northern Assurance'}], totalSize: query.includes('ambiguous') ? 2 : 1, done:true };\nelse if (query.includes('SUM(')) result = { records:[{total:0}],totalSize:1,done:true };\nelse if (query.includes('FROM OpportunityLineItem') || query.includes('IsWon = true') || query.includes('Renewal')) result = { records:[],totalSize:0,done:true };\nelse result = { records: query.includes('Id = null') ? [] : records, totalSize: query.includes('Id = null') ? 0 : records.length, done: !query.includes('partial') };\nconsole.log(JSON.stringify({status:0,result}));\n`,
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
    on() {},
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
          const collapsed = plain(view.render(width));
          if (tool.name === 'sf_query' && (args as any).query.includes('COUNT('))
            expect(collapsed).toContain('total = 0');
          if (tool.name === 'sf_query' && (args as any).query.includes('partial'))
            expect(collapsed).toContain('incomplete');
          if (result.isError) expect(collapsed).toContain('No such column');
          view.setExpanded(true);
          const lines = view.render(width);
          expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
          const expanded = plain(lines);
          if ((args as any).description === 'Recent customer opportunities') {
            expect(expanded).toContain('FINAL_OPPORTUNITY');
            expect(expanded).toContain('Synthetic parent');
            expect(expanded).toContain('null');
            expect(expanded).toContain('false');
            expect(expanded).not.toContain('[object Object]');
          }
          if (tool.name === 'sf_describe') expect(expanded).toContain('SyntheticProduct64__c');
          if (tool.name === 'sf_org_display') expect(expanded).not.toContain('SYNTHETIC_SECRET_SENTINEL');
          if (tool.name === 'sf_pipeline_report')
            expect(expanded.replace(/[\s│|]/g, '')).toContain('FINAL_OPPORTUNITY');
          view.setExpanded(false);
        }
      }
    }
  }
});

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
