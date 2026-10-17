import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';
import type { Args, Result } from '../src/presentation/shared';
import { formatSoql, tokens, value } from '../src/presentation/shared';

export const options = { expanded: false, isPartial: false };
export const view = (name: string, result: Result, args: Args = {}, expanded = false) =>
  presentTool({ name }, presentation).presentation.result(result, { ...options, expanded }, args);
export const tasks = Array.from({ length: 10 }, (_, i) => ({
  attributes: { type: 'Task' },
  Id: `synthetic-task-${i}`,
  Subject: `Prepare demo ${i}`,
  Status: i === 0 ? 'Not Started' : 'Completed',
  ActivityDate: '2026-10-20',
}));
export const event = {
  name: 'Event',
  label: 'Event',
  fields: [
    { name: 'Subject', label: 'Subject', type: 'string', custom: false, filterable: true, groupable: true },
    { name: 'StartDateTime', label: 'Start', type: 'datetime', custom: false, filterable: true, groupable: true },
    { name: 'Description', label: 'Description', type: 'textarea', custom: false, filterable: false, groupable: false },
    ...Array.from({ length: 17 }, (_, i) => ({
      name: `Synthetic${i}__c`,
      label: `Synthetic ${i}`,
      type: 'picklist',
      custom: true,
      picklistValues: ['First', 'FINAL_PICKLIST'],
      referenceTo: ['Contact'],
    })),
  ],
  childRelationships: Array.from({ length: 3 }, (_, i) => ({
    childSObject: `SyntheticChild${i}`,
    relationshipName: `SyntheticChildren${i}`,
    field: 'EventId',
  })),
};
test('describe uses compact standard preview, truthful counts and full filtered metadata', () => {
  const result = { content: [], details: { described: event } };
  const output = view('sf_describe', result, { sobject: 'Event' });
  expect(output.summary).toBeUndefined();
  expect(JSON.stringify(output)).toContain('Standard fields');
  expect(JSON.stringify(output)).toContain('17 custom fields omitted');
  expect(output.warnings).not.toContain('Custom fields');
  const text = JSON.stringify(output);
  expect(text).toContain('Date/time');
  expect(text).toContain('Filter, group');
  expect(text).toContain('Neither');
  expect(text).not.toContain('FINAL_PICKLIST');
  expect(output.sections?.find((s) => s.kind === 'table')?.columns.map((c) => c.label)).toEqual([
    'Label',
    'API name',
    'Type',
    'Query use',
  ]);
  const expanded = JSON.stringify(view('sf_describe', result, { match: 'Synthetic' }, true));
  expect(expanded).toContain('FINAL_PICKLIST');
  expect(expanded).toContain('SyntheticChild2');
  expect(expanded).toContain('Contact');
  expect(JSON.stringify(view('sf_describe', result, { match: 'no-such-field' }))).toContain(
    'No matching fields or child relationships',
  );
});
test('org display reports missing evidence explicitly and whitelists identity', () => {
  const result = {
    content: [],
    details: {
      orgs: [
        {
          username: 'synthetic@example.com',
          orgId: 'synthetic-org',
          instanceUrl: 'https://salesforce.example.com',
          connectedStatus: 'Connected',
          isSandbox: false,
        },
      ],
      orgEvidence: {
        username: 'synthetic@example.com',
        id: 'synthetic-org',
        instanceUrl: 'https://salesforce.example.com',
        accessToken: 'SECRET_SENTINEL',
      },
    },
  };
  const output = view('sf_org_display', result);
  expect(output.summary).toBe('Not returned');
  expect(output.sections?.find((s) => s.kind === 'fields' && 'Environment' in s.values)?.values).toMatchObject({
    Environment: 'Not returned',
    Default: 'Not returned',
  });
  expect(JSON.stringify(output)).not.toContain('Connected');
  expect(JSON.stringify(output)).not.toContain('SECRET_SENTINEL');
  expect(JSON.stringify(view('sf_org_display', result, {}, true))).not.toContain('SECRET_SENTINEL');
  const explicit = view('sf_org_display', {
    content: [],
    details: {
      orgs: [],
      orgEvidence: {
        ...result.details.orgEvidence,
        connectedStatus: 'Disconnected',
        isSandbox: false,
        isDefaultUsername: false,
      },
    },
  });
  expect(JSON.stringify(explicit)).toContain('Production');
  expect(JSON.stringify(explicit)).toContain('false');
});
export const helpText =
  'Execute a SOQL query.\n\nUSAGE\n  $ sf data query -q <value>\n\nFLAGS\n  -q, --query=<value>  (required) SOQL to execute\n  -o, --target-org=<value>  Org alias\n\nEXAMPLES\n  $ sf data query -q "SELECT Id FROM Task"\n\nUNFAMILIAR SECTION\n  FINAL_HELP_EVIDENCE';
test('help orders purpose, usage, required inputs, optional flags and examples and retains unknown sections', () => {
  const result = { content: [{ type: 'text', text: helpText }] };
  const output = view('sf_help', result, { command_path: 'data query' });
  expect(output.summary).toBe('Execute a SOQL query.');
  const titles = output.sections?.map((s) => s.title).filter(Boolean);
  expect(titles).toEqual(['Usage', 'Required inputs', 'Optional flags', 'Examples']);
  expect(JSON.stringify(output)).not.toContain('FINAL_HELP_EVIDENCE');
  expect(JSON.stringify(view('sf_help', result, {}, true))).toContain('FINAL_HELP_EVIDENCE');
  const literal = 'unfamiliar | literal\n  keep spacing 北方';
  expect(JSON.stringify(view('sf_help', { content: [{ type: 'text', text: literal }] }))).toContain('keep spacing');
});
test('pipeline orders scope first, separates currencies, retains distributions and source evidence', () => {
  const section = {
    totals: { platform: 1234.56789, shape: 0, other: 20 },
    quotaTotal: 1234.56789,
    accounts: [{ name: 'Synthetic account', platform: 1234.56789, shape: 0, other: 20 }],
  };
  const group = {
    netNew: section,
    booked: section,
    renewals: section,
    forecast: { commit: 0, bestCase: 1000, pipeline: 1234.56789 },
    topDeals: [{ name: 'Synthetic deal', amount: 1234.56789 }],
    topRenewals: [],
    closeDistribution: [{ label: 'October', amount: 1234.56789 }],
    renewalDistribution: [],
  };
  const report = {
    quarter: { start: '2026-08-01', end: '2026-10-31' },
    fyLabel: 'FY26',
    openScopeStart: '2025-10-01',
    teamMembers: ['Synthetic team'],
    territories: ['Synthetic territory'],
    currencyBreakdown: [
      { currency: 'CAD', ...group },
      { currency: 'USD', ...group },
    ],
    netNew: { quotaTotal: 2469.13578 },
    fyBookedTotal: 0,
    unavailable: ['History unavailable'],
    anomalies: [
      { severity: 'info', message: 'Informational detail' },
      { severity: 'warning', message: 'Classification unverified' },
    ],
    sourceQueries: [{ query: 'SELECT Name, Amount FROM Opportunity', records: [{ Name: 'FINAL_SOURCE', Amount: 0 }] }],
    recentChanges: [{ newValue: 'FINAL_CHANGE' }],
  };
  const result = { content: [], details: { pipelineReport: report } };
  const output = view('sf_pipeline_report', result);
  expect(output.sections?.[0].title).toBe('Report scope');
  expect(output.warnings).toContain('Currencies remain separate. Combined monetary totals are not valid.');
  expect(output.warnings).toContain('History unavailable');
  expect(output.warnings).toContain('Classification unverified');
  expect(output.warnings).not.toContain('Informational detail');
  const text = JSON.stringify(output);
  expect(text).toContain('Close distribution');
  expect(text).toContain('1,234.56789');
  expect(text).not.toContain('2,469.13578');
  const expanded = JSON.stringify(view('sf_pipeline_report', result, {}, true));
  expect(expanded).toContain('FINAL_SOURCE');
  expect(expanded).toContain('FINAL_CHANGE');
});
const query = 'SELECT Subject, Status, ActivityDate FROM Task ORDER BY ActivityDate LIMIT 10';
test('exec query shows operation and readable SOQL once, exact evidence only on expansion', () => {
  const args = { args: ['data:query', '-q', query, '-o', 'synthetic-demo', '--json'] };
  const result = {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 0,
          result: { records: tasks, totalSize: 10, done: true },
          warnings: ['Synthetic CLI warning'],
        }),
      },
    ],
  };
  const collapsed = view('sf_exec', result, args);
  expect(collapsed.summary).toContain('10 records returned');
  expect(collapsed.warnings).toContain('Synthetic CLI warning');
  const text = JSON.stringify(collapsed);
  expect(text).toContain('sf data:query');
  expect(text).toContain('synthetic-demo');
  expect(text).toContain('--json');
  expect(
    collapsed.sections?.filter((s) => s.kind === 'table').flatMap((s) => s.columns.map((c) => c.key)),
  ).not.toContain('Id');
  expect(collapsed.sections?.filter((s) => s.kind === 'code')).toHaveLength(1);
  expect(JSON.stringify(view('sf_exec', result, args, true))).toContain('data:query');
});
test('query distinguishes aggregates from ordinary scalar rows and preserves precision and evidence', () => {
  const aggregate = {
    content: [],
    details: {
      queryResult: {
        records: [{ attributes: { type: 'AggregateResult' }, expr0: 1234, reported: '9876543.2100' }],
        totalSize: 1,
        done: true,
      },
    },
  };
  const result = view('sf_query', aggregate, { query: 'SELECT COUNT(Id), SUM(Amount) reported FROM Opportunity' });
  expect(JSON.stringify(result)).toContain('1,234');
  expect(JSON.stringify(result)).toContain('9,876,543.2100');
  expect(JSON.stringify(result)).toContain('Opportunity count');
  expect(JSON.stringify(result)).toContain('Reported amount');
  expect(result.warnings).toContain('Amount currency was not returned.');
  const regular = view(
    'sf_query',
    {
      content: [],
      details: {
        queryResult: {
          records: [{ Subject: '北方 | long\nvalue', Value: 0, Flag: false, Nothing: null }],
          totalSize: 1,
          done: true,
        },
      },
    },
    { query: 'SELECT Subject, Value, Flag, Nothing FROM Task' },
  );
  expect(regular.summary).toContain('1 records returned');
  expect(JSON.stringify(regular)).not.toContain('Aggregate metrics');
  const partial = {
    content: [],
    details: {
      queryResult: {
        records: [{ Name: 'Synthetic parent', Children: { records: [{ Subject: 'FINAL_CHILD' }], done: false } }],
        totalSize: 1200,
        done: false,
        nextRecordsUrl: '/synthetic-next',
      },
    },
  };
  expect(view('sf_query', partial).warnings?.join(' ')).toContain('Related records are incomplete');
  expect(JSON.stringify(view('sf_query', partial, {}, true))).toContain('FINAL_CHILD');
  expect(JSON.stringify(view('sf_query', partial, {}, true))).toContain('/synthetic-next');
  expect(view('sf_query', { content: [], details: { queryResult: { records: null } } }).warnings?.join(' ')).toContain(
    'Malformed',
  );
  const grouped = view(
    'sf_query',
    {
      content: [],
      details: {
        queryResult: {
          records: [
            { attributes: { type: 'AggregateResult' }, StageName: 'Open', total: 0 },
            { attributes: { type: 'AggregateResult' }, StageName: 'Won', total: null },
          ],
          done: true,
        },
      },
    },
    { query: 'SELECT StageName, SUM(Amount) total FROM Opportunity GROUP BY StageName' },
  );
  expect(grouped.summary).toContain('2 aggregate rows returned');
  expect(grouped.sections?.find((s) => s.kind === 'table')?.title).toBeUndefined();
  expect(JSON.stringify(grouped)).toContain('Reported amount');
});
test('SOQL formatting only changes whitespace tokens outside literals', () => {
  const query =
    "SELECT Id,(SELECT Subject FROM Tasks WHERE Subject = 'FROM \\' quoted   北方') FROM Account WHERE Name = 'a  b' ORDER BY Name LIMIT 10";
  expect(tokens(formatSoql(query))).toEqual(tokens(query));
  expect(formatSoql(query)).toContain("'a  b'");
  expect(formatSoql(query)).toContain('\nFROM Account');
  for (const uncertain of [
    "SELECT Id FROM Account WHERE Name = 'unterminated",
    'SELECT (Id FROM Account',
    'SELECT Id FROM Account /* comment */',
  ])
    expect(formatSoql(uncertain)).toBe(uncertain);
  expect(value('0001234.0000', true)).toBe('0,001,234.0000');
  expect(value(false)).toBe(false);
  expect(value(null)).toBe(null);
  expect(value(undefined)).toBe('Not returned');
});
test('a missing readable identifier keeps record IDs visible in the preview', () => {
  const output = view(
    'sf_query',
    {
      content: [],
      details: { queryResult: { records: [{ Id: 'synthetic-id', Name: null }], done: true, totalSize: 1 } },
    },
    { query: 'SELECT Id, Name FROM Account' },
  );
  expect(JSON.stringify(output.sections)).toContain('synthetic-id');
});
test('exec inventories schema, org, limits, status and literal/fallback families', () => {
  for (const [argv, payload, expected] of [
    [['sobject', 'list'], ['Task', 'Event'], 'Objects'],
    [['schema:sobject:list'], ['Task'], 'Objects'],
    [['limits', 'api', 'display'], [{ name: 'DailyApiRequests', remaining: 0, max: 1000 }], 'Limits'],
    [['data', 'resume'], { state: 'JobComplete', numberRecordsProcessed: 0, id: 'synthetic-job' }, 'JobComplete'],
    [['data', 'export', 'bulk'], { state: 'InProgress', numberRecordsProcessed: 5 }, 'InProgress'],
    [['api', 'request', 'rest'], { unfamiliar: 'kept' }, 'Generic CLI result'],
  ] as const) {
    const output = view(
      'sf_exec',
      { content: [{ type: 'text', text: JSON.stringify({ status: 0, result: payload }) }] },
      { args: argv },
    );
    expect(JSON.stringify(output)).toContain(expected);
  }
  for (const argv of [
    ['apex', 'get'],
    ['apex', 'tail'],
    ['help'],
    ['version'],
    ['commands'],
    ['which'],
    ['info'],
    ['apex', 'list'],
  ]) {
    const output = view(
      'sf_exec',
      { content: [{ type: 'text', text: 'literal | code\n  preserve spacing 北方' }] },
      { args: argv },
    );
    expect(output.sections?.some((s) => s.kind === 'code' && s.text.includes('  preserve spacing'))).toBe(true);
  }
});
