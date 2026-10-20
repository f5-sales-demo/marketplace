import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';
import { buildAzArgs } from '../src/tools/az-exec';

const options = { expanded: false, isPartial: false };
const result = (details: unknown, text = 'synthetic') => ({ content: [{ type: 'text', text }], details });
test('resource preview owns twelve rows and safe expanded evidence once', () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    name: `Example ${i}`,
    id: `synthetic-${i}`,
    tags: { enabled: false, count: 0, empty: '' },
  }));
  const tool = presentTool({ name: 'az_resource_list' }, presentation);
  const view = tool.presentation.result(result({ resources: rows }), options, { resource_group: 'synthetic' });
  expect(view.sections.find((s) => s.kind === 'table')).toMatchObject({ previewRows: 12, rows });
  expect(view.sections.find((s) => s.kind === 'code')?.argv).toEqual([
    'az',
    'resource',
    'list',
    '--resource-group',
    'synthetic',
    '--output',
    'json',
  ]);
  const expanded = tool.presentation.result(
    result({ resources: rows }),
    { ...options, expanded: true },
    { resource_group: 'synthetic' },
  );
  expect(expanded.expandedEvidence).toBe('provided');
  expect(JSON.stringify(expanded).match(/Example 12/g)).toHaveLength(1);
});
test('single subscription keeps all identity fields, false and empty values', () => {
  const identity = {
    id: 'synthetic',
    name: '',
    isDefault: false,
    tenantId: 'example',
    state: 'Enabled',
    userName: 'example',
  };
  const view = presentTool({ name: 'az_account_show' }, presentation).presentation.result(
    result({ subscriptions: [identity] }),
    options,
    { action: 'show' },
  );
  expect(view.sections.find((s) => s.kind === 'fields' && s.title === 'Subscription identity')).toMatchObject({
    previewFields: 'all',
    values: identity,
  });
});
test('malformed results retain corrective guidance and automatic fallback', () => {
  const view = presentTool({ name: 'az_resource_list' }, presentation).presentation.result(
    result({ resources: 'bad' }, 'Run exactly: az login'),
    options,
    {},
  );
  expect(view.expandedEvidence).not.toBe('provided');
  expect(view.completeness).not.toBe('provided');
  expect(JSON.stringify(view)).toContain('Run exactly: az login');
});
test('equals-form output flags remain effective', () => {
  expect(buildAzArgs(['account', 'show', '--output=tsv'])).toEqual(['account', 'show', '--output=tsv']);
  expect(buildAzArgs(['account', 'show', '-o=table'])).toEqual(['account', 'show', '-o=table']);
});

test('partial graph results expose pagination and scope warnings by default', () => {
  const view = presentTool({ name: 'az_resource_graph_query' }, presentation).presentation.result(
    result({
      data: [],
      outcome: 'partial_scope',
      count: 0,
      totalRecords: 13,
      truncated: true,
      skipToken: 'synthetic-page',
      inaccessibleScopeCount: 2,
    }),
    options,
    { query: 'Resources' },
  );
  expect(JSON.stringify(view)).toContain('synthetic-page');
  expect(JSON.stringify(view)).toContain('partial_scope');
  expect(view.warnings.join(' ')).toMatch(/scope/i);
});
test('CE status shows checkpoint, unknown health, false and zero without a fictitious command', () => {
  const view = presentTool({ name: 'azure_ce_status' }, presentation).presentation.result(
    result({
      tool: 'azure_ce_status',
      evidence: {
        planId: 'synthetic',
        checkpoint: { state: 'partial', completedActionIds: [] },
        azure: { resources: [], vms: [], routeServerPeers: [] },
        f5: { siteState: 'UNKNOWN', bgpEstablished: false, learnedRouteCount: 0 },
      },
    }),
    options,
    {},
  );
  expect(view.sections.find((s) => s.kind === 'fields' && s.title === 'Customer Edge status')).toMatchObject({
    previewFields: 'all',
    values: expect.objectContaining({
      State: 'partial',
      'Site state': 'UNKNOWN',
      'BGP established': false,
      'Learned routes': 0,
    }),
  });
  expect(view.sections.some((s) => s.kind === 'code' && s.argv)).toBe(false);
});
test('expanded cloud-init calls withhold source and bootstrap references', () => {
  const view = presentTool({ name: 'azure_cloud_init_analyze' }, presentation).presentation.call(
    {
      source: 'SYNTHETIC_SECRET_SENTINEL',
      bootstrapRefs: { node: 'SYNTHETIC_SECRET_SENTINEL' },
      sourceArtifactId: '12',
    },
    { ...options, expanded: true },
  );
  expect(JSON.stringify(view)).not.toContain('SYNTHETIC_SECRET_SENTINEL');
  expect(JSON.stringify(view)).toContain('12');
});

test('declared commands reproduce typed execution including tags and explicit list actions', async () => {
  const { Type } = await import('@sinclair/typebox');
  const { createAzAccountShowTool } = await import('../src/tools/az-account-show');
  const { createAzGroupListTool } = await import('../src/tools/az-group-list');
  const { createAzResourceListTool } = await import('../src/tools/az-resource-list');
  const { createAzVmListTool } = await import('../src/tools/az-vm-list');
  const { createAzHelpTool } = await import('../src/tools/az-help');
  const calls: string[][] = [];
  const makeApi = () => ({
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: '[]', stderr: '', exitCode: 0 };
    },
  });
  const cases = [
    [createAzAccountShowTool({ typebox: { Type } }, makeApi), { action: 'list', subscription: 'Example' }],
    [
      createAzGroupListTool({ typebox: { Type } }, makeApi),
      { action: 'list', name: 'synthetic', tag: 'enabled=false', subscription: 'Example' },
    ],
    [createAzGroupListTool({ typebox: { Type } }, makeApi), { action: 'show', name: 'synthetic' }],
    [
      createAzResourceListTool({ typebox: { Type } }, makeApi),
      { resource_group: 'synthetic', resource_type: 'Microsoft.Compute/virtualMachines' },
    ],
    [
      createAzVmListTool({ typebox: { Type } }, makeApi),
      { include_power_state: false, include_network_identifiers: true },
    ],
    [createAzHelpTool({ typebox: { Type } }, makeApi), { command_path: ' network  vnet ' }],
  ] as const;
  for (const [tool, input] of cases) {
    await tool.execute('synthetic', input as never, undefined, undefined, { cwd: '/synthetic' });
    const executed = calls.at(-1);
    if (!executed) throw new Error('Expected Azure execution arguments');
    expect(
      presentTool(tool, presentation)
        .presentation.call(input, options)
        .sections.find((s) => s.kind === 'code')?.argv,
    ).toEqual(['az', ...executed]);
  }
});

for (const shell of ['bash', 'zsh']) {
  const shellTest = Bun.which(shell) ? test : test.skip;
  shellTest(`exact commands preserve literal arguments in ${shell}`, async () => {
    const { execFileSync } = await import('node:child_process');
    const argv = [
      'synthetic-harmless',
      '',
      ' spaces ',
      "quote'",
      '"double"',
      '$x',
      '`literal`',
      '|',
      ';',
      '☁',
      'line\nbreak',
    ];
    const command = presentation.command(argv).text;
    const bytes = execFileSync(shell, ['-c', `synthetic-harmless() { printf '%s\\0' "$@"; }; ${command}`]);
    expect(bytes.toString().split('\0').slice(0, -1)).toEqual(argv.slice(1));
  });
}

test('malformed CE envelopes retain automatic evidence and complete literal guidance', () => {
  for (const name of ['azure_ce_plan', 'azure_ce_status', 'azure_ce_inventory', 'azure_compute_discover']) {
    const view = presentTool({ name }, presentation).presentation.result(
      result(
        { plan: { wrong: true }, evidence: { wrong: true }, inventory: { wrong: true }, observation: { wrong: true } },
        'Run exactly: xcsh plugin setup azure',
      ),
      options,
      {},
    );
    expect(view.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(view)).toContain('Run exactly: xcsh plugin setup azure');
  }
});
